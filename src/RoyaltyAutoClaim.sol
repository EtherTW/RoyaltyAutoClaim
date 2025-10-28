// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {PackedUserOperation} from "@account-abstraction/contracts/interfaces/PackedUserOperation.sol";
import {IAccount} from "@account-abstraction/contracts/interfaces/IAccount.sol";
import {ECDSA} from "solady/utils/ECDSA.sol";
import {ReentrancyGuard} from "solady/utils/ReentrancyGuard.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeTransferLib} from "solady/utils/SafeTransferLib.sol";
import {StringUtils} from "@zk-email/contracts/utils/StringUtils.sol";
import {IRegistrationVerifier} from "./RegistrationVerifier.sol";

interface IRoyaltyAutoClaim {
    // Owner functions
    // function upgradeToAndCall(address newImplementation, bytes memory data) external payable;
    function transferOwnership(address newOwner) external;
    function changeAdmin(address _admin) external;
    function changeRoyaltyToken(address _token) external;
    function emergencyWithdraw(address _token, uint256 _amount) external;

    // Admin functions
    function updateReviewers(address[] memory _reviewers, bool[] memory _status) external;
    function revokeSubmission(string memory title) external;

    // Registration & Recipient Update functions
    function registerSubmission(string memory title, address royaltyRecipient, bytes32 emailHeaderHash) external;
    function updateRoyaltyRecipient(string memory title, address newRecipient, bytes32 emailHeaderHash) external;

    // Reviewer functions
    function reviewSubmission(string memory title, uint16 royaltyLevel) external;

    // Recipient functions
    function claimRoyalty(string memory title) external;

    // Events
    event AdminChanged(address indexed oldAdmin, address indexed newAdmin);
    event RoyaltyTokenChanged(address indexed oldToken, address indexed newToken);
    event EmergencyWithdraw(address indexed token, uint256 amount);
    event ReviewerStatusUpdated(address indexed reviewer, bool status);
    event RegistrationVerifierUpdated(address indexed registrationVerifier);

    event SubmissionRegistered(string indexed titleHash, address indexed royaltyRecipient, string title);
    event SubmissionRoyaltyRecipientUpdated(
        string indexed titleHash, address indexed oldRecipient, address indexed newRecipient, string title
    );
    event SubmissionRevoked(string indexed titleHash, string title);
    event SubmissionReviewed(string indexed titleHash, address indexed reviewer, uint16 royaltyLevel, string title);
    event RoyaltyClaimed(address indexed recipient, uint256 amount, string title);

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
    error EmptyString();
    error InvalidRoyaltyLevel(uint16 royaltyLevel);
    error SubmissionNotClaimable();
    error RenounceOwnershipDisabled();
    error AlreadyRegistered();
    error EmailProofUsed();
    error SubmissionStatusNotRegistered();
    error NotFromEntryPoint();
    error ForbiddenPaymaster();
    error UnsupportSelector(bytes4 selector);
    error AlreadyReviewed();
    error InvalidSignatureLength();
    error SameAddress();
    error SameStatus();
    error ZeroAmount();

    // Structs
    struct Configs {
        address admin;
        address token;
        mapping(address => bool) reviewers;
        IRegistrationVerifier registrationVerifier;
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
        mapping(bytes32 => bool) emailNullifierHashes;
    }
}

contract RoyaltyAutoClaim is IRoyaltyAutoClaim, UUPSUpgradeable, OwnableUpgradeable, IAccount, ReentrancyGuard {
    using SafeERC20 for IERC20;
    using SafeTransferLib for address;
    using StringUtils for *;

    uint8 public constant ROYALTY_LEVEL_20 = 20;
    uint8 public constant ROYALTY_LEVEL_40 = 40;
    uint8 public constant ROYALTY_LEVEL_60 = 60;
    uint8 public constant ROYALTY_LEVEL_80 = 80;
    address public constant NATIVE_TOKEN = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;

    uint256 public constant SIG_VALIDATION_FAILED = 1;

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

    receive() external payable {}

    function initialize(
        address _owner,
        address _admin,
        address _token,
        address[] memory _reviewers,
        IRegistrationVerifier _verifier
    ) public initializer {
        require(_owner != address(0), ZeroAddress());
        require(_admin != address(0), ZeroAddress());
        require(_token != address(0), ZeroAddress());
        require(address(_verifier) != address(0), ZeroAddress());

        __Ownable_init(_owner);
        MainStorage storage $ = _getMainStorage();
        $.configs.admin = _admin;
        $.configs.token = _token;
        for (uint256 i = 0; i < _reviewers.length; i++) {
            require(_reviewers[i] != address(0), ZeroAddress());
            $.configs.reviewers[_reviewers[i]] = true;
        }
        $.configs.registrationVerifier = _verifier;
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

    modifier onlyEntryPoint() {
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

    function _authorizeUpgrade(address newImplementation) internal override onlyOwnerOrEntryPoint {}

    /// @dev override transferOwnership for using 4337 flow
    function transferOwnership(address newOwner)
        public
        override(OwnableUpgradeable, IRoyaltyAutoClaim)
        onlyOwnerOrEntryPoint
    {
        if (newOwner == address(0)) {
            revert ZeroAddress();
        }
        _transferOwnership(newOwner);
    }

    function changeAdmin(address _admin) public onlyOwnerOrEntryPoint {
        require(_admin != address(0), ZeroAddress());
        require(_admin != admin(), SameAddress());
        address oldAdmin = _getMainStorage().configs.admin;
        _getMainStorage().configs.admin = _admin;
        emit AdminChanged(oldAdmin, _admin);
    }

    function changeRoyaltyToken(address _token) public onlyOwnerOrEntryPoint {
        require(_token != address(0), ZeroAddress());
        require(_token != token(), SameAddress());
        address oldToken = _getMainStorage().configs.token;
        _getMainStorage().configs.token = _token;
        emit RoyaltyTokenChanged(oldToken, _token);
    }

    function renounceOwnership() public pure override {
        revert RenounceOwnershipDisabled();
    }

    function emergencyWithdraw(address _token, uint256 _amount) public onlyOwnerOrEntryPoint {
        require(_amount > 0, ZeroAmount());

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
            require(_status[i] != isReviewer(_reviewers[i]), SameStatus());
            _getMainStorage().configs.reviewers[_reviewers[i]] = _status[i];
            emit ReviewerStatusUpdated(_reviewers[i], _status[i]);
        }
    }

    function revokeSubmission(string memory title) public onlyAdminOrEntryPoint {
        require(submissions(title).status == SubmissionStatus.Registered, SubmissionStatusNotRegistered());
        delete _getMainStorage().submissions[title];
        emit SubmissionRevoked(title, title);
    }

    function updateRegistrationVerifier(IRegistrationVerifier _verifier) public onlyAdminOrEntryPoint {
        require(address(_verifier) != address(0), ZeroAddress());
        _getMainStorage().configs.registrationVerifier = _verifier;
        emit RegistrationVerifierUpdated(address(_verifier));
    }

    // ================================ Registration & Recipient Update ================================

    function registerSubmission(
        string memory title,
        address royaltyRecipient,
        bytes32 emailHeaderHash,
        IRegistrationVerifier.ZkEmailProof calldata proof
    ) public {
        this.verifySubmissionRegistration(title, royaltyRecipient, emailHeaderHash, proof);
        _registerSubmission(title, royaltyRecipient, emailHeaderHash);
    }

    function registerSubmission(string memory title, address royaltyRecipient, bytes32 emailHeaderHash)
        public
        onlyEntryPoint
    {
        _registerSubmission(title, royaltyRecipient, emailHeaderHash);
    }

    function verifySubmissionRegistration(
        string memory title,
        address royaltyRecipient,
        bytes32 emailHeaderHash,
        IRegistrationVerifier.ZkEmailProof calldata proof
    ) external view {
        require(bytes(title).length > 0, EmptyString());
        require(royaltyRecipient != address(0), ZeroAddress());
        require(submissions(title).status == SubmissionStatus.NotExist, AlreadyRegistered());
        require(!isEmailProofUsed(emailHeaderHash), EmailProofUsed());
        _getMainStorage().configs.registrationVerifier
            .verify(title, royaltyRecipient, emailHeaderHash, IRegistrationVerifier.Intention.REGISTRATION, proof);
    }

    function _registerSubmission(string memory title, address royaltyRecipient, bytes32 emailHeaderHash) internal {
        MainStorage storage $ = _getMainStorage();
        $.emailNullifierHashes[emailHeaderHash] = true;
        $.submissions[title].royaltyRecipient = royaltyRecipient;
        $.submissions[title].status = SubmissionStatus.Registered;
        emit SubmissionRegistered(title, royaltyRecipient, title);
    }

    function updateRoyaltyRecipient(
        string memory title,
        address newRecipient,
        bytes32 emailHeaderHash,
        IRegistrationVerifier.ZkEmailProof calldata proof
    ) public {
        this.verifyRecipientUpdate(title, newRecipient, emailHeaderHash, proof);
        _updateRoyaltyRecipient(title, newRecipient, emailHeaderHash);
    }

    function updateRoyaltyRecipient(string memory title, address newRecipient, bytes32 emailHeaderHash)
        public
        onlyEntryPoint
    {
        _updateRoyaltyRecipient(title, newRecipient, emailHeaderHash);
    }

    function verifyRecipientUpdate(
        string memory title,
        address newRecipient,
        bytes32 emailHeaderHash,
        IRegistrationVerifier.ZkEmailProof calldata proof
    ) external view {
        require(submissions(title).status == SubmissionStatus.Registered, SubmissionStatusNotRegistered());
        require(newRecipient != submissions(title).royaltyRecipient, SameAddress());
        require(!isEmailProofUsed(emailHeaderHash), EmailProofUsed());
        _getMainStorage().configs.registrationVerifier
            .verify(title, newRecipient, emailHeaderHash, IRegistrationVerifier.Intention.RECIPIENT_UPDATE, proof);
    }

    function _updateRoyaltyRecipient(string memory title, address newRecipient, bytes32 emailHeaderHash) internal {
        MainStorage storage $ = _getMainStorage();
        $.emailNullifierHashes[emailHeaderHash] = true;
        address oldRecipient = $.submissions[title].royaltyRecipient;
        $.submissions[title].royaltyRecipient = newRecipient;
        emit SubmissionRoyaltyRecipientUpdated(title, oldRecipient, newRecipient, title);
    }

    // ================================ Reviewer ================================

    function reviewSubmission(string memory title, uint16 royaltyLevel) public {
        if (msg.sender == entryPoint()) {
            _reviewSubmission(title, royaltyLevel, _getUserOpSigner());
        } else {
            _requireReviewable(title, royaltyLevel, msg.sender);
            _reviewSubmission(title, royaltyLevel, msg.sender);
        }
    }

    function _requireReviewable(string memory title, uint16 royaltyLevel, address reviewer) internal view {
        require(isReviewer(reviewer), Unauthorized(reviewer));
        require(submissions(title).status == SubmissionStatus.Registered, SubmissionStatusNotRegistered());
        require(
            royaltyLevel == ROYALTY_LEVEL_20 || royaltyLevel == ROYALTY_LEVEL_40 || royaltyLevel == ROYALTY_LEVEL_60
                || royaltyLevel == ROYALTY_LEVEL_80,
            InvalidRoyaltyLevel(royaltyLevel)
        );
        require(!hasReviewed(title, reviewer), AlreadyReviewed());
    }

    function _reviewSubmission(string memory title, uint16 royaltyLevel, address reviewer) internal {
        MainStorage storage $ = _getMainStorage();
        $.hasReviewed[title][reviewer] = true;
        $.submissions[title].reviewCount++;
        $.submissions[title].totalRoyaltyLevel += royaltyLevel;
        emit SubmissionReviewed(title, reviewer, royaltyLevel, title);
    }

    // ================================ Recipient ================================

    function claimRoyalty(string memory title) public nonReentrant {
        if (msg.sender == entryPoint()) {
            _claimRoyalty(title, _getUserOpSigner());
        } else {
            _requireClaimable(title, msg.sender);
            _claimRoyalty(title, msg.sender);
        }
    }

    function _requireClaimable(string memory title, address recipient) internal view {
        require(isRecipient(title, recipient), Unauthorized(recipient));
        require(isSubmissionClaimable(title), SubmissionNotClaimable());
    }

    function _claimRoyalty(string memory title, address recipient) internal {
        MainStorage storage $ = _getMainStorage();
        $.submissions[title].status = SubmissionStatus.Claimed;
        uint256 amount = getRoyalty(title);
        IERC20(token()).safeTransfer(recipient, amount);
        emit RoyaltyClaimed(recipient, amount, title);
    }

    // ================================ ERC-4337 ================================

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

        /// ========================= Registration & Recipient Update =========================
        /// @dev userOp.signature equals to the encoded proof

        if (selector == IRoyaltyAutoClaim.registerSubmission.selector) {
            (string memory title, address recipient, bytes32 emailHeaderHash) =
                abi.decode(userOp.callData[4:], (string, address, bytes32));

            IRegistrationVerifier.ZkEmailProof memory proof =
                abi.decode(userOp.signature, (IRegistrationVerifier.ZkEmailProof));

            if (!_getMainStorage().configs.registrationVerifier.verifyUserOpHash(userOpHash, proof)) {
                return SIG_VALIDATION_FAILED;
            }

            try this.verifySubmissionRegistration(title, recipient, emailHeaderHash, proof) {
                return 0;
            } catch {
                return SIG_VALIDATION_FAILED;
            }
        } else if (selector == IRoyaltyAutoClaim.updateRoyaltyRecipient.selector) {
            (string memory title, address recipient, bytes32 emailHeaderHash) =
                abi.decode(userOp.callData[4:], (string, address, bytes32));

            IRegistrationVerifier.ZkEmailProof memory proof =
                abi.decode(userOp.signature, (IRegistrationVerifier.ZkEmailProof));

            if (!_getMainStorage().configs.registrationVerifier.verifyUserOpHash(userOpHash, proof)) {
                return SIG_VALIDATION_FAILED;
            }

            try this.verifyRecipientUpdate(title, recipient, emailHeaderHash, proof) {
                return 0;
            } catch {
                return SIG_VALIDATION_FAILED;
            }
        }

        /// ========================= Other functions =========================
        /// @dev userOp.signature[0:65]: actual signature
        /// @dev userOp.signature[65:85]: appended signer address
        /// @notice The reason for needing appendedSigner instead of directly using signer is because eth_estimateUserOperationGas uses a dummy signature

        if (userOp.signature.length != 85) {
            revert InvalidSignatureLength();
        }

        bytes memory actualSignature = bytes(userOp.signature[:65]);
        address appendedSigner = address(bytes20(userOp.signature[65:]));
        address signer = ECDSA.recover(ECDSA.toEthSignedMessageHash(userOpHash), actualSignature);

        if (
            // ========================================= Owner =========================================
            selector == this.upgradeToAndCall.selector || selector == this.changeAdmin.selector
                || selector == this.changeRoyaltyToken.selector || selector == this.transferOwnership.selector
                || selector == this.emergencyWithdraw.selector
        ) {
            require(appendedSigner == owner(), Unauthorized(appendedSigner));
            if (signer != appendedSigner) {
                return SIG_VALIDATION_FAILED;
            }
            return 0;
        } else if (
            // ========================================= Admin =========================================
            selector == this.updateReviewers.selector || selector == this.revokeSubmission.selector
                || selector == this.updateRegistrationVerifier.selector
        ) {
            require(appendedSigner == admin(), Unauthorized(appendedSigner));
            if (signer != appendedSigner) {
                return SIG_VALIDATION_FAILED;
            }
            return 0;
        } else if ( // ========================================= Reviewer =========================================
            selector == this.reviewSubmission.selector
        ) {
            (string memory title, uint16 royaltyLevel) = abi.decode(userOp.callData[4:], (string, uint16));
            _requireReviewable(title, royaltyLevel, appendedSigner);

            assembly {
                tstore(TRANSIENT_SIGNER_SLOT, appendedSigner)
            }

            if (signer != appendedSigner) {
                return SIG_VALIDATION_FAILED;
            }
            return 0;
        } else if ( // ========================================= Recipient =========================================
            selector == this.claimRoyalty.selector
        ) {
            (string memory title) = abi.decode(userOp.callData[4:], (string));
            _requireClaimable(title, appendedSigner);

            assembly {
                tstore(TRANSIENT_SIGNER_SLOT, appendedSigner)
            }

            if (signer != appendedSigner) {
                return SIG_VALIDATION_FAILED;
            }
            return 0;
        }

        revert UnsupportSelector(selector);
    }

    function _getUserOpSigner() internal view returns (address) {
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

    function registrationVerifier() public view returns (address) {
        return address(_getMainStorage().configs.registrationVerifier);
    }

    function isReviewer(address reviewer) public view returns (bool) {
        return _getMainStorage().configs.reviewers[reviewer];
    }

    function isRecipient(string memory title, address recipient) public view returns (bool) {
        return _getMainStorage().submissions[title].royaltyRecipient == recipient;
    }

    function isEmailProofUsed(bytes32 emailHeaderHash) public view returns (bool) {
        return _getMainStorage().emailNullifierHashes[emailHeaderHash];
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
        if (submissions(title).reviewCount == 0) {
            return 0;
        }
        uint8 decimals = IERC20Metadata(token()).decimals();
        return (uint256(submissions(title).totalRoyaltyLevel) * (10 ** decimals)) / submissions(title).reviewCount;
    }

    function entryPoint() public pure returns (address) {
        return 0x4337084D9E255Ff0702461CF8895CE9E3b5Ff108; // v0.8
    }
}
