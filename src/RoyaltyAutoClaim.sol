// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {PackedUserOperation} from "@account-abstraction/contracts/interfaces/PackedUserOperation.sol";
import {IAccount} from "@account-abstraction/contracts/interfaces/IAccount.sol";
import {ECDSA} from "solady/utils/ECDSA.sol";
import {ReentrancyGuard} from "solady/utils/ReentrancyGuard.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";

interface IRoyaltyAutoClaim {
    // Owner functions
    function upgradeToAndCall(address newImplementation, bytes memory data) external payable;
    function transferOwnership(address newOwner) external;
    function changeAdmin(address _admin) external;
    function changeRoyaltyToken(address _token) external;
    function emergencyWithdraw(address _token, uint256 _amount) external;

    // Admin functions
    function updateReviewers(address[] memory _reviewers, bool[] memory _status) external;
    function registerSubmission(string memory title, address royaltyRecipient) external;
    function updateRoyaltyRecipient(string memory title, address newRoyaltyRecipient) external;
    function revokeSubmission(string memory title) external;

    // Reviewer functions
    function reviewSubmission(string memory title, uint16 royaltyLevel) external;

    // Submitter functions
    function claimRoyalty(string memory title) external;

    // Events
    event AdminChanged(address indexed oldAdmin, address indexed newAdmin);
    event RoyaltyTokenChanged(address indexed oldToken, address indexed newToken);
    event EmergencyWithdraw(address indexed token, uint256 amount);
    event ReviewerStatusUpdated(address indexed reviewer, bool status);
    event SubmissionRegistered(string indexed title, address indexed royaltyRecipient);
    event SubmissionRoyaltyRecipientUpdated(
        string indexed title, address indexed oldRecipient, address indexed newRecipient
    );
    event SubmissionRevoked(string indexed title);
    event SubmissionReviewed(string indexed title, address indexed reviewer, uint16 royaltyLevel);
    event RoyaltyClaimed(string indexed title, address indexed recipient, uint256 amount);

    // View functions
    function admin() external view returns (address);
    function token() external view returns (address);
    function submissions(string memory title) external view returns (Submission memory);
    function isReviewer(address reviewer) external view returns (bool);
    function hasReviewed(string memory title, address reviewer) external view returns (bool);
    function isSubmissionClaimable(string memory title) external view returns (bool);
    function getRoyalty(string memory title) external view returns (uint256 royalty);
    function entryPoint() external pure returns (address);

    // Errors
    error ZeroAddress();
    error Unauthorized(address caller);
    error InvalidArrayLength();
    error EmptyTitle();
    error InvalidRoyaltyLevel(uint16 royaltyLevel);
    error NotEnoughReviews();
    error AlreadyClaimed();
    error RenounceOwnershipDisabled();
    error AlreadyRegistered();
    error SubmissionNotExist();
    error SubmissionNotRegistered();
    error NotFromEntryPoint();
    error ForbiddenPaymaster();
    error UnsupportSelector(bytes4 selector);
    error AlreadyReviewed();

    // Structs
    struct Configs {
        address admin;
        address token;
        mapping(address => bool) reviewers;
    }

    struct Submission {
        address royaltyRecipient;
        uint16 totalRoyaltyLevel;
        SubmissionStatus status;
        uint8 reviewCount;
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
        mapping(string => mapping(address => bool)) hasReviewed;
    }
}

contract RoyaltyAutoClaim is IRoyaltyAutoClaim, UUPSUpgradeable, OwnableUpgradeable, IAccount, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint8 public constant ROYALTY_LEVEL_20 = 20;
    uint8 public constant ROYALTY_LEVEL_40 = 40;
    uint8 public constant ROYALTY_LEVEL_60 = 60;
    uint8 public constant ROYALTY_LEVEL_80 = 80;
    address public constant NATIVE_TOKEN = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;

    // keccak256(abi.encode(uint256(keccak256("royaltyautoclaim.storage.main")) - 1)) & ~bytes32(uint256(0xff));
    /// @dev cast index-erc7201 royaltyautoclaim.storage.main
    bytes32 private constant MAIN_STORAGE_SLOT = 0x41a2efc794119f946ab405955f96dacdfa298d25a3ae81c9a8cc1dea5771a900;
    /// @dev cast index-erc7201 royaltyautoclaim.storage.signer
    bytes32 private constant TRANSIENT_SIGNER_SLOT = 0xbbc49793e8d16b6166d591f0a7a95f88efe9e6a08bf1603701d7f0fe05d7d600;

    function _getMainStorage() private pure returns (MainStorage storage $) {
        assembly {
            $.slot := MAIN_STORAGE_SLOT
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
    function upgradeToAndCall(address newImplementation, bytes memory data)
        public
        payable
        override(UUPSUpgradeable, IRoyaltyAutoClaim)
        onlyOwnerOrEntryPoint
    {
        super.upgradeToAndCall(newImplementation, data);
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwnerOrEntryPoint {}

    function transferOwnership(address newOwner)
        public
        override(OwnableUpgradeable, IRoyaltyAutoClaim)
        onlyOwnerOrEntryPoint
    {
        super.transferOwnership(newOwner);
    }

    function changeAdmin(address _admin) public onlyOwnerOrEntryPoint {
        require(_admin != address(0), ZeroAddress());
        address oldAdmin = _getMainStorage().configs.admin;
        _getMainStorage().configs.admin = _admin;
        emit AdminChanged(oldAdmin, _admin);
    }

    function changeRoyaltyToken(address _token) public onlyOwnerOrEntryPoint {
        require(_token != address(0), ZeroAddress());
        address oldToken = _getMainStorage().configs.token;
        _getMainStorage().configs.token = _token;
        emit RoyaltyTokenChanged(oldToken, _token);
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
        emit EmergencyWithdraw(_token, _amount);
    }

    // ================================ Admin ================================

    function updateReviewers(address[] memory _reviewers, bool[] memory _status) public onlyAdminOrEntryPoint {
        require(_reviewers.length == _status.length, InvalidArrayLength());
        require(_reviewers.length > 0, InvalidArrayLength());

        for (uint256 i = 0; i < _reviewers.length; i++) {
            _getMainStorage().configs.reviewers[_reviewers[i]] = _status[i];
            emit ReviewerStatusUpdated(_reviewers[i], _status[i]);
        }
    }

    function registerSubmission(string memory title, address royaltyRecipient) public onlyAdminOrEntryPoint {
        require(bytes(title).length > 0, EmptyTitle());
        require(royaltyRecipient != address(0), ZeroAddress());
        require(submissions(title).status == SubmissionStatus.NotExist, AlreadyRegistered());
        MainStorage storage $ = _getMainStorage();
        $.submissions[title].royaltyRecipient = royaltyRecipient;
        $.submissions[title].status = SubmissionStatus.Registered;
        emit SubmissionRegistered(title, royaltyRecipient);
    }

    function updateRoyaltyRecipient(string memory title, address newRoyaltyRecipient) public onlyAdminOrEntryPoint {
        require(submissions(title).status == SubmissionStatus.Registered, SubmissionNotRegistered());
        address oldRecipient = _getMainStorage().submissions[title].royaltyRecipient;
        _getMainStorage().submissions[title].royaltyRecipient = newRoyaltyRecipient;
        emit SubmissionRoyaltyRecipientUpdated(title, oldRecipient, newRoyaltyRecipient);
    }

    function revokeSubmission(string memory title) public onlyAdminOrEntryPoint {
        require(submissions(title).status == SubmissionStatus.Registered, SubmissionNotRegistered());
        delete _getMainStorage().submissions[title];
        emit SubmissionRevoked(title);
    }

    // ================================ Reviewer ================================

    function reviewSubmission(string memory title, uint16 royaltyLevel) public onlyReviewerOrEntryPoint {
        require(
            royaltyLevel == ROYALTY_LEVEL_20 || royaltyLevel == ROYALTY_LEVEL_40 || royaltyLevel == ROYALTY_LEVEL_60
                || royaltyLevel == ROYALTY_LEVEL_80,
            InvalidRoyaltyLevel(royaltyLevel)
        );

        address reviewer;
        if (msg.sender == entryPoint()) {
            reviewer = _getUserOpSigner();
        } else {
            reviewer = msg.sender;
        }

        MainStorage storage $ = _getMainStorage();
        if ($.hasReviewed[title][reviewer]) {
            revert AlreadyReviewed();
        }
        $.hasReviewed[title][reviewer] = true;
        $.submissions[title].reviewCount++;
        $.submissions[title].totalRoyaltyLevel += royaltyLevel;
        emit SubmissionReviewed(title, reviewer, royaltyLevel);
    }

    // ================================ Submitter ================================

    function claimRoyalty(string memory title) public nonReentrant {
        if (submissions(title).status == SubmissionStatus.NotExist) {
            revert SubmissionNotExist();
        } else if (submissions(title).status == SubmissionStatus.Claimed) {
            revert AlreadyClaimed();
        } else if (!isSubmissionClaimable(title)) {
            revert NotEnoughReviews();
        }
        uint256 amount = getRoyalty(title);
        MainStorage storage $ = _getMainStorage();
        $.submissions[title].status = SubmissionStatus.Claimed;

        IERC20(token()).safeTransfer(submissions(title).royaltyRecipient, amount);
        emit RoyaltyClaimed(title, submissions(title).royaltyRecipient, amount);
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

            assembly {
                tstore(TRANSIENT_SIGNER_SLOT, signer)
            }

            return 0;
        } else if (selector == this.claimRoyalty.selector) {
            // Anybody
            return 0;
        }

        revert UnsupportSelector(selector);
    }

    /// @dev 當函式透過 4337 flow 呼叫且需要 signer address 時使用 ex. hasReviewed in reviewSubmission
    function _getUserOpSigner() internal view onlyEntryPoint returns (address) {
        address signer;
        assembly {
            signer := tload(TRANSIENT_SIGNER_SLOT)
        }

        if (signer == address(0)) {
            revert ZeroAddress();
        }

        return signer;
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

    function hasReviewed(string memory title, address reviewer) public view returns (bool) {
        return _getMainStorage().hasReviewed[title][reviewer];
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
        uint8 decimals = IERC20Metadata(token()).decimals();
        return (uint256(submissions(title).totalRoyaltyLevel) * (10 ** decimals)) / submissions(title).reviewCount;
    }

    function entryPoint() public pure returns (address) {
        return 0x0000000071727De22E5E9d8BAf0edAc6f37da032; // v0.7
    }
}
