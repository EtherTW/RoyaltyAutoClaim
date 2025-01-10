// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {PackedUserOperation} from "@account-abstraction/contracts/interfaces/PackedUserOperation.sol";
import {IAccount} from "@account-abstraction/contracts/interfaces/IAccount.sol";
import {ECDSA} from "solady/utils/ECDSA.sol";

contract UUPSProxy is ERC1967Proxy {
    constructor(address _implementation, bytes memory _data) payable ERC1967Proxy(_implementation, _data) {
        (bool success,) = _implementation.delegatecall(_data);
        require(success, "Initialization failed");
    }
}

contract RoyaltyAutoClaim is UUPSUpgradeable, OwnableUpgradeable, IAccount {
    using SafeERC20 for IERC20;

    error ZeroAddress();
    error Unauthorized(address caller);
    error ArrayLengthMismatch();
    error EmptyTitle();
    error AlreadyRegistered();
    error InvalidToken();
    error InvalidRoyaltyLevel();
    error NotEnoughReviews();
    error AlreadyClaimed();
    error RenounceOwnershipDisabled();
    error SubmissionNotExist();
    error NotClaimable();
    error NotFromEntryPoint();
    error ForbiddenPaymaster();

    uint8 public constant ROYALTY_LEVEL_20 = 20;
    uint8 public constant ROYALTY_LEVEL_40 = 40;
    uint8 public constant ROYALTY_LEVEL_60 = 60;
    uint8 public constant ROYALTY_LEVEL_80 = 80;

    uint256 constant ERC4337_VALIDATION_SUCCESS = 0;
    uint256 constant ERC4337_VALIDATION_FAILED = 1;
    bytes4 constant ERC1271_MAGICVALUE = 0x1626ba7e;
    bytes4 constant ERC1271_INVALID = 0xffffffff;

    address public admin;
    address public token; // 稿費幣種

    mapping(address => bool) public reviewers;

    struct Submission {
        address royaltyRecipient;
        uint8 reviewCount;
        uint16 totalRoyaltyLevel;
    }

    mapping(string => Submission) public submissions;
    mapping(string => bool) public claimed;

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
        admin = _admin;
        token = _token;
        for (uint256 i = 0; i < _reviewers.length; i++) {
            reviewers[_reviewers[i]] = true;
        }
    }

    // ================================ Modifier ================================

    modifier onlyOwnerOrEntryPoint() {
        require(msg.sender == owner() || msg.sender == entryPoint(), Unauthorized(msg.sender));
        _;
    }

    modifier onlyAdminOrEntryPoint() {
        require(msg.sender == admin || msg.sender == entryPoint(), Unauthorized(msg.sender));
        _;
    }

    modifier onlyReviewerOrEntryPoint() {
        require(reviewers[msg.sender] || msg.sender == entryPoint(), Unauthorized(msg.sender));
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
        admin = _admin;
    }

    function changeRoyaltyToken(address _token) public onlyOwnerOrEntryPoint {
        require(_token != address(0), ZeroAddress());
        require(IERC20(_token).totalSupply() >= 0, InvalidToken());
        token = _token;
    }

    function renounceOwnership() public pure override {
        revert RenounceOwnershipDisabled();
    }

    // ================================ Admin ================================

    function updateReviewers(address[] memory _reviewers, bool[] memory _status) public onlyAdminOrEntryPoint {
        require(_reviewers.length == _status.length, ArrayLengthMismatch());

        for (uint256 i = 0; i < _reviewers.length; i++) {
            reviewers[_reviewers[i]] = _status[i];
        }
    }

    function registerSubmission(string memory title, address royaltyRecipient) public onlyAdminOrEntryPoint {
        require(bytes(title).length > 0, EmptyTitle());
        require(royaltyRecipient != address(0), ZeroAddress());
        require(!isSubmissionExist(title), AlreadyRegistered());
        submissions[title].royaltyRecipient = royaltyRecipient;
    }

    function updateRoyaltyRecipient(string memory title, address newRoyaltyRecipient) public onlyAdminOrEntryPoint {
        require(isSubmissionExist(title), SubmissionNotExist());
        submissions[title].royaltyRecipient = newRoyaltyRecipient;
    }

    function revokeSubmission(string memory title) public onlyAdminOrEntryPoint {
        require(isSubmissionExist(title), SubmissionNotExist());
        delete submissions[title];
    }

    // ================================ Reviewer ================================

    function reviewSubmission(string memory title, uint16 royaltyLevel) public onlyReviewerOrEntryPoint {
        require(
            royaltyLevel == ROYALTY_LEVEL_20 || royaltyLevel == ROYALTY_LEVEL_40 || royaltyLevel == ROYALTY_LEVEL_60
                || royaltyLevel == ROYALTY_LEVEL_80,
            InvalidRoyaltyLevel()
        );
        submissions[title].reviewCount++;
        submissions[title].totalRoyaltyLevel += royaltyLevel;
    }

    // ================================ Submitter ================================

    // TODO: add ReentrancyGuard
    function claimRoyalty(string memory title) public {
        require(isSubmissionExist(title), SubmissionNotExist());
        require(isSubmissionClaimable(title), NotClaimable());
        uint256 royaltyAmount = getRoyalty(title);
        claimed[title] = true;
        IERC20(token).safeTransfer(submissions[title].royaltyRecipient, royaltyAmount);
    }

    // ================================ View ================================

    function isSubmissionExist(string memory title) public view returns (bool) {
        return submissions[title].royaltyRecipient != address(0);
    }

    function isSubmissionClaimable(string memory title) public view returns (bool) {
        if (!isSubmissionExist(title) || claimed[title]) {
            return false;
        }
        return submissions[title].reviewCount >= 2 && getRoyalty(title) > 0;
    }

    function getRoyalty(string memory title) public view returns (uint256 royalty) {
        require(isSubmissionExist(title), SubmissionNotExist());
        Submission memory submission = submissions[title];
        if (submission.reviewCount == 0) {
            return 0;
        }
        // TODO: add multiplier variable or just use 1e18?
        return (submission.totalRoyaltyLevel * 1e18) / submission.reviewCount;
    }

    /**
     * @dev EntryPoint for v0.7
     */
    function entryPoint() public pure returns (address) {
        return 0x0000000071727De22E5E9d8BAf0edAc6f37da032;
    }

    // ================================ ERC-4337 ================================

    /**
     * @dev Ensure that userOp.sender has the appropriate permissions of Owner, Admin, or Reviewer.
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

        // validate permission of userOp.sender
        bytes4 selector = bytes4(userOp.callData[0:4]);

        if (
            // Owner
            selector == this.upgradeToAndCall.selector || selector == this.changeAdmin.selector
                || selector == this.changeRoyaltyToken.selector || selector == this.transferOwnership.selector
        ) {
            if (userOp.sender != owner()) {
                revert Unauthorized(userOp.sender);
            }
        } else if (
            // Admin
            selector == this.updateReviewers.selector || selector == this.registerSubmission.selector
                || selector == this.updateRoyaltyRecipient.selector || selector == this.revokeSubmission.selector
        ) {
            if (userOp.sender != admin) {
                revert Unauthorized(userOp.sender);
            }
            // Reviewer
        } else if (selector == this.reviewSubmission.selector) {
            if (!reviewers[userOp.sender]) {
                revert Unauthorized(userOp.sender);
            }
        }

        // validate signature
        bool isValid = _validateSignature(userOp.sender, userOpHash, userOp.signature);
        if (!isValid) {
            return ERC4337_VALIDATION_FAILED;
        }
        return ERC4337_VALIDATION_SUCCESS;
    }

    function _validateSignature(address signer, bytes32 hash, bytes calldata signature) internal view returns (bool) {
        if (signer == ECDSA.recover(hash, signature)) {
            return true;
        }
        bytes32 ethHash = ECDSA.toEthSignedMessageHash(hash);
        address recovered = ECDSA.recover(ethHash, signature);
        if (signer != recovered) {
            return false;
        }
        return true;
    }

    /**
     * @dev ERC-1271 (optional)
     * @param data 0-20: signer, 20-: signature
     */
    function isValidSignature(bytes32 hash, bytes calldata data) external view returns (bytes4) {
        address signer = address(bytes20(data[0:20]));
        bool isValid = _validateSignature(signer, hash, data[20:]);
        if (isValid) {
            return ERC1271_MAGICVALUE;
        }
        return ERC1271_INVALID;
    }
}
