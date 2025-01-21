// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {PackedUserOperation} from "@account-abstraction/contracts/interfaces/PackedUserOperation.sol";
import {IAccount} from "@account-abstraction/contracts/interfaces/IAccount.sol";
import {ECDSA} from "solady/utils/ECDSA.sol";
import {ReentrancyGuard} from "solady/utils/ReentrancyGuard.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";

contract RoyaltyAutoClaim is UUPSUpgradeable, OwnableUpgradeable, IAccount, ReentrancyGuard {
    using SafeERC20 for IERC20;

    error ZeroAddress();
    error Unauthorized(address caller);
    error ArrayLengthMismatch();
    error EmptyTitle();
    error AlreadyRegistered();
    error InvalidToken();
    error InvalidRoyaltyLevel(uint16 royaltyLevel);
    error NotEnoughReviews();
    error AlreadyClaimed();
    error RenounceOwnershipDisabled();
    error SubmissionNotExist();
    error SubmissionNotRegistered();
    error NotFromEntryPoint();
    error ForbiddenPaymaster();
    error ZeroRoyalty();
    error UnsupportSelector(bytes4 selector);

    uint8 public constant ROYALTY_LEVEL_20 = 20;
    uint8 public constant ROYALTY_LEVEL_40 = 40;
    uint8 public constant ROYALTY_LEVEL_60 = 60;
    uint8 public constant ROYALTY_LEVEL_80 = 80;
    address public constant NATIVE_TOKEN = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;

    struct Configs {
        address admin;
        address token;
        mapping(address => bool) reviewers;
    }

    struct Submission {
        address royaltyRecipient;
        uint8 reviewCount;
        uint16 totalRoyaltyLevel;
        SubmissionStatus status;
    }

    enum SubmissionStatus {
        NotExist,
        Registered,
        Claimed
    }

    /// @custom:storage-location erc7201:royaltyautoclaim.storage.main
    struct MainStorage {
        Configs configs;
        mapping(string => Submission) submissions;
    }

    // keccak256(abi.encode(uint256(keccak256("royaltyautoclaim.storage.main")) - 1)) & ~bytes32(uint256(0xff));
    /// @dev cast index-erc7201 royaltyautoclaim.storage.main
    bytes32 private constant MAIN_STORAGE_LOCATION = 0x41a2efc794119f946ab405955f96dacdfa298d25a3ae81c9a8cc1dea5771a900;

    function _getMainStorage() private pure returns (MainStorage storage $) {
        assembly {
            $.slot := MAIN_STORAGE_LOCATION
        }
    }

    constructor() {
        _disableInitializers();
    }

    function initialize(address _owner, address _admin, address _token, address[] memory _reviewers)
        public
        initializer
    {
        require(_owner != address(0), ZeroAddress());
        require(_admin != address(0), ZeroAddress());
        require(_token != address(0), ZeroAddress());

        __Ownable_init(_owner);
        MainStorage storage $ = _getMainStorage();
        $.configs.admin = _admin;
        $.configs.token = _token;
        for (uint256 i = 0; i < _reviewers.length; i++) {
            $.configs.reviewers[_reviewers[i]] = true;
        }
    }

    // ================================ Modifier ================================

    modifier onlyOwnerOrEntryPoint() {
        require(msg.sender == owner() || msg.sender == entryPoint(), Unauthorized(msg.sender));
        _;
    }

    modifier onlyAdminOrEntryPoint() {
        require(msg.sender == admin() || msg.sender == entryPoint(), Unauthorized(msg.sender));
        _;
    }

    modifier onlyReviewerOrEntryPoint() {
        require(isReviewer(msg.sender) || msg.sender == entryPoint(), Unauthorized(msg.sender));
        _;
    }

    modifier onlyEntryPoint() virtual {
        if (msg.sender != entryPoint()) {
            revert NotFromEntryPoint();
        }
        _;
    }

    /// @dev Sends to the EntryPoint (i.e. `msg.sender`) the missing funds for this transaction.
    /// @param missingAccountFunds is the minimum value this modifier should send the EntryPoint, which MAY be zero, in case there is enough deposit, or the userOp has a paymaster.
    /// @notice Modified from https://github.com/erc7579/erc7579-implementation/blob/main/src/MSAAdvanced.sol
    modifier payPrefund(uint256 missingAccountFunds) {
        _;
        /// @solidity memory-safe-assembly
        assembly {
            if missingAccountFunds {
                // Ignore failure (it's EntryPoint's job to verify, not the account's).
                pop(call(gas(), caller(), missingAccountFunds, codesize(), 0x00, codesize(), 0x00))
            }
        }
    }

    // ================================ Owner ================================

    /**
     * @dev for upgradeToAndCall
     */
    function _authorizeUpgrade(address newImplementation) internal override onlyOwnerOrEntryPoint {}

    function changeAdmin(address _admin) public onlyOwnerOrEntryPoint {
        require(_admin != address(0), ZeroAddress());
        _getMainStorage().configs.admin = _admin;
    }

    function changeRoyaltyToken(address _token) public onlyOwnerOrEntryPoint {
        require(_token != address(0), ZeroAddress());
        _getMainStorage().configs.token = _token;
    }

    function renounceOwnership() public pure override {
        revert RenounceOwnershipDisabled();
    }

    function emergencyWithdraw(address _token, uint256 _amount) public onlyOwnerOrEntryPoint {
        if (_token == NATIVE_TOKEN) {
            (bool success,) = owner().call{value: _amount}("");
            require(success);
        } else {
            IERC20(_token).safeTransfer(owner(), _amount);
        }
    }

    // ================================ Admin ================================

    function updateReviewers(address[] memory _reviewers, bool[] memory _status) public onlyAdminOrEntryPoint {
        require(_reviewers.length == _status.length, ArrayLengthMismatch());

        for (uint256 i = 0; i < _reviewers.length; i++) {
            _getMainStorage().configs.reviewers[_reviewers[i]] = _status[i];
        }
    }

    function registerSubmission(string memory title, address royaltyRecipient) public onlyAdminOrEntryPoint {
        require(bytes(title).length > 0, EmptyTitle());
        require(royaltyRecipient != address(0), ZeroAddress());
        require(submissions(title).status == SubmissionStatus.NotExist, SubmissionNotExist());
        MainStorage storage $ = _getMainStorage();
        $.submissions[title].royaltyRecipient = royaltyRecipient;
        $.submissions[title].status = SubmissionStatus.Registered;
    }

    function updateRoyaltyRecipient(string memory title, address newRoyaltyRecipient) public onlyAdminOrEntryPoint {
        require(submissions(title).status == SubmissionStatus.Registered, SubmissionNotRegistered());
        _getMainStorage().submissions[title].royaltyRecipient = newRoyaltyRecipient;
    }

    function revokeSubmission(string memory title) public onlyAdminOrEntryPoint {
        require(submissions(title).status == SubmissionStatus.Registered, SubmissionNotRegistered());
        delete _getMainStorage().submissions[title];
    }

    // ================================ Reviewer ================================

    function reviewSubmission(string memory title, uint16 royaltyLevel) public onlyReviewerOrEntryPoint {
        require(
            royaltyLevel == ROYALTY_LEVEL_20 || royaltyLevel == ROYALTY_LEVEL_40 || royaltyLevel == ROYALTY_LEVEL_60
                || royaltyLevel == ROYALTY_LEVEL_80,
            InvalidRoyaltyLevel(royaltyLevel)
        );
        MainStorage storage $ = _getMainStorage();
        $.submissions[title].reviewCount++;
        $.submissions[title].totalRoyaltyLevel += royaltyLevel;
    }

    // ================================ Submitter ================================

    function claimRoyalty(string memory title) public nonReentrant {
        require(submissions(title).status == SubmissionStatus.Registered, SubmissionNotRegistered());
        require(submissions(title).status != SubmissionStatus.Claimed, AlreadyClaimed());
        require(isSubmissionClaimable(title), NotEnoughReviews());
        uint256 amount = getRoyalty(title);
        require(amount > 0, ZeroRoyalty());
        MainStorage storage $ = _getMainStorage();
        $.submissions[title].status = SubmissionStatus.Claimed;

        if (token() == NATIVE_TOKEN) {
            (bool success,) = submissions(title).royaltyRecipient.call{value: amount}("");
            require(success);
        } else {
            IERC20(token()).safeTransfer(submissions(title).royaltyRecipient, amount);
        }
    }

    // ================================ ERC-4337 ================================

    /**
     * @dev Ensure that signer has the appropriate permissions of Owner, Admin, or Reviewer.
     * @dev Forbid to use paymaster
     * TODO: 檢查手續費最多不能超過 X ETH（X 的值待定）
     */
    function validateUserOp(PackedUserOperation calldata userOp, bytes32 userOpHash, uint256 missingAccountFunds)
        external
        onlyEntryPoint
        payPrefund(missingAccountFunds)
        returns (uint256 validationData)
    {
        if (userOp.paymasterAndData.length > 0) {
            revert ForbiddenPaymaster();
        }

        bytes4 selector = bytes4(userOp.callData[0:4]);
        bytes32 ethHash = ECDSA.toEthSignedMessageHash(userOpHash);
        address signer = ECDSA.recover(ethHash, userOp.signature);

        if (
            selector == this.upgradeToAndCall.selector || selector == this.changeAdmin.selector
                || selector == this.changeRoyaltyToken.selector || selector == this.transferOwnership.selector
                || selector == this.emergencyWithdraw.selector
        ) {
            // Owner
            if (signer != owner()) {
                revert Unauthorized(signer);
            }
            return 0;
        } else if (
            selector == this.updateReviewers.selector || selector == this.registerSubmission.selector
                || selector == this.updateRoyaltyRecipient.selector || selector == this.revokeSubmission.selector
        ) {
            // Admin
            if (signer != admin()) {
                revert Unauthorized(signer);
            }
            return 0;
        } else if (selector == this.reviewSubmission.selector) {
            // Reviewer
            if (!isReviewer(signer)) {
                revert Unauthorized(signer);
            }
            return 0;
            // Anybody
        } else if (selector == this.claimRoyalty.selector) {
            return 0;
        }

        revert UnsupportSelector(selector);
    }

    // ================================ View ================================

    function admin() public view returns (address) {
        return _getMainStorage().configs.admin;
    }

    function token() public view returns (address) {
        return _getMainStorage().configs.token;
    }

    function submissions(string memory title) public view returns (Submission memory) {
        return _getMainStorage().submissions[title];
    }

    function isReviewer(address reviewer) public view returns (bool) {
        return _getMainStorage().configs.reviewers[reviewer];
    }

    function isSubmissionClaimable(string memory title) public view returns (bool) {
        if (submissions(title).status != SubmissionStatus.Registered) {
            return false;
        }
        return submissions(title).reviewCount >= 2;
    }

    function getRoyalty(string memory title) public view returns (uint256 royalty) {
        if (!isSubmissionClaimable(title)) {
            return 0;
        }
        uint8 decimals = token() == NATIVE_TOKEN ? 18 : IERC20Metadata(token()).decimals();
        return (uint256(submissions(title).totalRoyaltyLevel) * (10 ** decimals)) / submissions(title).reviewCount;
    }

    /// @dev v0.7
    function entryPoint() public pure returns (address) {
        return 0x0000000071727De22E5E9d8BAf0edAc6f37da032;
    }
}
