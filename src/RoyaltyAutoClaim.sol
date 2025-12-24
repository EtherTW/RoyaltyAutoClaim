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
import {IEmailVerifier} from "./EmailVerifier.sol";
import {ISemaphore} from "@semaphore/interfaces/ISemaphore.sol";
import {TitleHashVerifierLib} from "./verifiers/TitleHashVerifierLib.sol";

interface IRoyaltyAutoClaim {
    // Owner
    // function upgradeToAndCall(address newImplementation, bytes memory data) external payable;
    function transferOwnership(address newOwner) external;
    function changeAdmin(address _admin) external;
    function changeRoyaltyToken(address _token) external;
    function emergencyWithdraw(address _token, uint256 _amount) external;

    // ZK Email Registration & Recipient Update
    function registerSubmission(string memory title, TitleHashVerifierLib.EmailProof calldata proof) external;
    function registerSubmission4337(string memory title, address recipient, bytes32 nullifier) external;
    function updateRoyaltyRecipient(string memory title, TitleHashVerifierLib.EmailProof calldata proof) external;
    function updateRoyaltyRecipient4337(string memory title, address recipient, bytes32 nullifier) external;

    // Admin
    function adminRegisterSubmission(string memory title, address royaltyRecipient) external;
    function adminUpdateRoyaltyRecipient(string memory title, address newRecipient) external;
    function revokeSubmission(string memory title) external;
    function updateEmailVerifier(IEmailVerifier _verifier) external;

    // Reviewer
    function reviewSubmission(string memory title, uint16 royaltyLevel, uint256 nullifier) external;

    // Claim (Recipient or Admin)
    function claimRoyalty(string memory title) external;

    // Events
    event AdminChanged(address indexed oldAdmin, address indexed newAdmin);
    event RoyaltyTokenChanged(address indexed oldToken, address indexed newToken);
    event EmergencyWithdraw(address indexed token, uint256 amount);
    event EmailVerifierUpdated(address indexed emailVerifier);
    event EmailRevoked(uint256 indexed number);

    event SubmissionRegistered(string indexed titleHash, address indexed royaltyRecipient, string title);
    event SubmissionRoyaltyRecipientUpdated(
        string indexed titleHash, address indexed oldRecipient, address indexed newRecipient, string title
    );
    event SubmissionRevoked(string indexed titleHash, string title);
    event SubmissionReviewed(
        string indexed titleHash, uint256 indexed nullifierHash, uint16 royaltyLevel, string title
    );
    event RoyaltyClaimed(address indexed recipient, uint256 amount, string title);

    // View
    function admin() external view returns (address);
    function token() external view returns (address);
    function submissions(string memory title) external view returns (Submission memory);
    function hasReviewed(string memory title, uint256 nullifier) external view returns (bool);
    function reviewerGroupId() external view returns (uint256);
    function semaphore() external view returns (ISemaphore);
    function isSubmissionClaimable(string memory title) external view returns (bool);
    function getRoyalty(string memory title) external view returns (uint256 royalty);
    function isEmailRevoked(uint256 number) external view returns (bool);
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
    error ZeroAmount();
    error InvalidProof();
    error InvalidSemaphoreProof();
    error NullifierMismatch();
    error MessageMismatch();
    error ScopeMismatch();
    error RecipientMismatch();
    error InvalidOperationType();
    error RevokedEmail(uint256 number);

    // Structs
    struct Configs {
        address admin;
        address token;
        ISemaphore semaphore; // Semaphore verifier contract reference
        uint256 reviewerGroupId; // Semaphore group ID for authorized reviewers
        IEmailVerifier emailVerifier;
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
        mapping(string => mapping(uint256 => bool)) hasReviewed; // Track nullifiers per submission
        mapping(bytes32 => bool) emailNullifierHashes;
        mapping(uint256 => bool) revokedEmailNumbers; // Track revoked email numbers
    }
}

contract RoyaltyAutoClaim is IRoyaltyAutoClaim, UUPSUpgradeable, OwnableUpgradeable, IAccount, ReentrancyGuard {
    using SafeERC20 for IERC20;
    using SafeTransferLib for address;
    using TitleHashVerifierLib for TitleHashVerifierLib.EmailProof;

    uint8 public constant ROYALTY_LEVEL_20 = 20;
    uint8 public constant ROYALTY_LEVEL_40 = 40;
    uint8 public constant ROYALTY_LEVEL_60 = 60;
    uint8 public constant ROYALTY_LEVEL_80 = 80;
    address public constant NATIVE_TOKEN = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;

    uint256 public constant SIG_VALIDATION_FAILED = 1;

    /// @dev cast index-erc7201 royaltyautoclaim.storage.main
    bytes32 private constant MAIN_STORAGE_SLOT = 0x41a2efc794119f946ab405955f96dacdfa298d25a3ae81c9a8cc1dea5771a900;

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
        IEmailVerifier _verifier,
        ISemaphore _semaphore
    ) public initializer {
        require(_owner != address(0), ZeroAddress());
        require(_admin != address(0), ZeroAddress());
        require(_token != address(0), ZeroAddress());
        require(address(_verifier) != address(0), ZeroAddress());
        require(address(_semaphore) != address(0), ZeroAddress());

        __Ownable_init(_owner);
        MainStorage storage $ = _getMainStorage();
        $.configs.admin = _admin;
        $.configs.token = _token;
        $.configs.emailVerifier = _verifier;
        $.configs.semaphore = _semaphore;

        // Create a new Semaphore group for reviewers with _admin as group admin
        uint256 groupId = _semaphore.createGroup(_admin);
        $.configs.reviewerGroupId = groupId;
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

    // ========================= Owner =========================

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

    // ========================= Admin =========================

    function adminRegisterSubmission(string memory title, address royaltyRecipient) public onlyAdminOrEntryPoint {
        require(bytes(title).length > 0, EmptyString());
        require(royaltyRecipient != address(0), ZeroAddress());
        require(submissions(title).status == SubmissionStatus.NotExist, AlreadyRegistered());

        MainStorage storage $ = _getMainStorage();
        $.submissions[title].royaltyRecipient = royaltyRecipient;
        $.submissions[title].status = SubmissionStatus.Registered;
        emit SubmissionRegistered(title, royaltyRecipient, title);
    }

    function adminUpdateRoyaltyRecipient(string memory title, address newRecipient) public onlyAdminOrEntryPoint {
        require(submissions(title).status == SubmissionStatus.Registered, SubmissionStatusNotRegistered());
        require(newRecipient != address(0), ZeroAddress());
        require(newRecipient != submissions(title).royaltyRecipient, SameAddress());

        MainStorage storage $ = _getMainStorage();
        address oldRecipient = $.submissions[title].royaltyRecipient;
        $.submissions[title].royaltyRecipient = newRecipient;
        emit SubmissionRoyaltyRecipientUpdated(title, oldRecipient, newRecipient, title);
    }

    function revokeSubmission(string memory title) public onlyAdminOrEntryPoint {
        require(submissions(title).status == SubmissionStatus.Registered, SubmissionStatusNotRegistered());
        delete _getMainStorage().submissions[title];
        emit SubmissionRevoked(title, title);
    }

    function updateEmailVerifier(IEmailVerifier _verifier) public onlyAdminOrEntryPoint {
        require(address(_verifier) != address(0), ZeroAddress());
        _getMainStorage().configs.emailVerifier = _verifier;
        emit EmailVerifierUpdated(address(_verifier));
    }

    function revokeEmail(uint256 number) public onlyAdminOrEntryPoint {
        MainStorage storage $ = _getMainStorage();
        $.revokedEmailNumbers[number] = true;
        emit EmailRevoked(number);
    }

    /* -------------------------------------------------------------------------- */
    /*                  ZK Email Registration & Recipient Update                  */
    /* -------------------------------------------------------------------------- */

    /// @dev call directly
    function registerSubmission(string memory title, TitleHashVerifierLib.EmailProof calldata proof) public {
        if (!_verifyRegistration(title, proof)) {
            revert InvalidProof();
        }
        _registerSubmission(title, proof.recipient(), proof.nullifier());
    }

    /// @dev call via ERC-4337
    function registerSubmission4337(string memory title, address recipient, bytes32 nullifier) public onlyEntryPoint {
        _registerSubmission(title, recipient, nullifier);
    }

    function _verifyRegistration(string memory title, TitleHashVerifierLib.EmailProof memory proof)
        internal
        view
        returns (bool)
    {
        require(bytes(title).length > 0, EmptyString());
        require(proof.recipient() != address(0), ZeroAddress());
        require(submissions(title).status == SubmissionStatus.NotExist, AlreadyRegistered());
        require(!isEmailProofUsed(proof.nullifier()), EmailProofUsed());
        require(proof.operationType() == TitleHashVerifierLib.OperationType.REGISTRATION, InvalidOperationType());

        // Verify email number is not revoked
        uint256 emailNumber = proof.number();
        require(!_getMainStorage().revokedEmailNumbers[emailNumber], RevokedEmail(emailNumber));

        return _getMainStorage().configs.emailVerifier.verifyEmail(title, proof);
    }

    function _registerSubmission(string memory title, address recipient, bytes32 nullifier) internal {
        MainStorage storage $ = _getMainStorage();
        $.emailNullifierHashes[nullifier] = true;
        $.submissions[title].royaltyRecipient = recipient;
        $.submissions[title].status = SubmissionStatus.Registered;
        emit SubmissionRegistered(title, recipient, title);
    }

    /// @dev call directly
    function updateRoyaltyRecipient(string memory title, TitleHashVerifierLib.EmailProof calldata proof) public {
        if (!_verifyRecipientUpdate(title, proof)) {
            revert InvalidProof();
        }

        _updateRoyaltyRecipient(title, proof.recipient(), proof.nullifier());
    }

    /// @dev call via ERC-4337
    function updateRoyaltyRecipient4337(string memory title, address recipient, bytes32 nullifier)
        public
        onlyEntryPoint
    {
        _updateRoyaltyRecipient(title, recipient, nullifier);
    }

    function _verifyRecipientUpdate(string memory title, TitleHashVerifierLib.EmailProof memory proof)
        internal
        view
        returns (bool)
    {
        require(submissions(title).status == SubmissionStatus.Registered, SubmissionStatusNotRegistered());
        require(proof.recipient() != submissions(title).royaltyRecipient, SameAddress());
        require(!isEmailProofUsed(proof.nullifier()), EmailProofUsed());
        require(proof.operationType() == TitleHashVerifierLib.OperationType.RECIPIENT_UPDATE, InvalidOperationType());

        // Verify email number is not revoked
        uint256 emailNumber = proof.number();
        require(!_getMainStorage().revokedEmailNumbers[emailNumber], RevokedEmail(emailNumber));

        return _getMainStorage().configs.emailVerifier.verifyEmail(title, proof);
    }

    function _updateRoyaltyRecipient(string memory title, address recipient, bytes32 nullifier) internal {
        MainStorage storage $ = _getMainStorage();
        $.emailNullifierHashes[nullifier] = true;
        address oldRecipient = $.submissions[title].royaltyRecipient;
        $.submissions[title].royaltyRecipient = recipient;
        emit SubmissionRoyaltyRecipientUpdated(title, oldRecipient, recipient, title);
    }

    // ========================= Reviewer =========================

    /// @dev call directly
    /// @notice Direct calls have access to the full proof, so nullifier can be extracted from it
    function reviewSubmission(
        string memory title,
        uint16 royaltyLevel,
        ISemaphore.SemaphoreProof calldata semaphoreProof
    ) public {
        require(_verifyReviewEligibility(title, royaltyLevel, semaphoreProof), InvalidSemaphoreProof());
        _reviewSubmission(title, royaltyLevel, semaphoreProof.nullifier);
    }

    /// @dev call via ERC-4337
    /// @notice ERC-4337 flow requires nullifier as a separate parameter because the proof
    ///         is only available in the validation phase (validateUserOp), not in execution phase
    function reviewSubmission(string memory title, uint16 royaltyLevel, uint256 nullifier) public onlyEntryPoint {
        _reviewSubmission(title, royaltyLevel, nullifier);
    }

    function _verifyReviewEligibility(
        string memory title,
        uint16 royaltyLevel,
        ISemaphore.SemaphoreProof memory semaphoreProof
    ) internal view returns (bool) {
        MainStorage storage $ = _getMainStorage();

        // Check submission status
        require($.submissions[title].status == SubmissionStatus.Registered, SubmissionStatusNotRegistered());

        // Validate royalty level
        require(
            royaltyLevel == ROYALTY_LEVEL_20 || royaltyLevel == ROYALTY_LEVEL_40 || royaltyLevel == ROYALTY_LEVEL_60
                || royaltyLevel == ROYALTY_LEVEL_80,
            InvalidRoyaltyLevel(royaltyLevel)
        );

        // Verify the message matches the royaltyLevel
        require(semaphoreProof.message == uint256(royaltyLevel), MessageMismatch());

        // Check nullifier hasn't been used
        require(!$.hasReviewed[title][semaphoreProof.nullifier], AlreadyReviewed());

        // Compute and verify scope
        uint256 scope = uint256(keccak256(abi.encodePacked(title)));
        require(semaphoreProof.scope == scope, ScopeMismatch());

        // Verify proof
        return $.configs.semaphore.verifyProof($.configs.reviewerGroupId, semaphoreProof);
    }

    function _reviewSubmission(string memory title, uint16 royaltyLevel, uint256 nullifierHash) internal {
        MainStorage storage $ = _getMainStorage();
        $.hasReviewed[title][nullifierHash] = true;
        $.submissions[title].reviewCount++;
        $.submissions[title].totalRoyaltyLevel += royaltyLevel;
        emit SubmissionReviewed(title, nullifierHash, royaltyLevel, title);
    }

    /// ========================= Cliam Royalty =========================
    /// @dev Only the recipient and the admin can claim royalty

    function claimRoyalty(string memory title) public nonReentrant {
        if (msg.sender == entryPoint()) {
            _claimRoyalty(title);
        } else {
            _requireClaimable(title, msg.sender);
            _claimRoyalty(title);
        }
    }

    function _requireClaimable(string memory title, address caller) internal view {
        require(isRecipient(title, caller) || isAdmin(caller), Unauthorized(caller));
        require(isSubmissionClaimable(title), SubmissionNotClaimable());
    }

    function _claimRoyalty(string memory title) internal {
        MainStorage storage $ = _getMainStorage();
        $.submissions[title].status = SubmissionStatus.Claimed;
        address recipient = $.submissions[title].royaltyRecipient;
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

        /// ========================= Email-based operations =========================
        /// @dev userOp.signature equals to the encoded proof
        if (
            selector == IRoyaltyAutoClaim.registerSubmission4337.selector
                || selector == IRoyaltyAutoClaim.updateRoyaltyRecipient4337.selector
        ) {
            (string memory title, address recipient, bytes32 nullifier) =
                abi.decode(userOp.callData[4:], (string, address, bytes32));

            TitleHashVerifierLib.EmailProof memory proof =
                abi.decode(userOp.signature, (TitleHashVerifierLib.EmailProof));

            // Verify recipient and nullifier match the proof
            require(proof.recipient() == recipient, RecipientMismatch());
            require(proof.nullifier() == nullifier, NullifierMismatch());

            if (selector == IRoyaltyAutoClaim.registerSubmission4337.selector && !_verifyRegistration(title, proof)) {
                return SIG_VALIDATION_FAILED;
            }

            if (
                selector == IRoyaltyAutoClaim.updateRoyaltyRecipient4337.selector
                    && !_verifyRecipientUpdate(title, proof)
            ) {
                return SIG_VALIDATION_FAILED;
            }

            // Make the userOpHash check the final step, so that the gas estimated when running
            // frontend/scripts/estimate-verificationGasLimit.ts
            // is close to the gas used when the zk verify function is executed correctly.
            if (proof.userOpHash() != userOpHash) {
                return SIG_VALIDATION_FAILED;
            }

            return 0;
        }

        /// ========================= Semaphore-based operations =========================
        /// @dev userOp.signature equals to the encoded SemaphoreProof
        if (selector == IRoyaltyAutoClaim.reviewSubmission.selector) {
            (string memory title, uint16 royaltyLevel, uint256 nullifier) =
                abi.decode(userOp.callData[4:], (string, uint16, uint256));

            ISemaphore.SemaphoreProof memory semaphoreProof = abi.decode(userOp.signature, (ISemaphore.SemaphoreProof));

            // Verify the nullifier in callData matches the proof
            // This is necessary because the proof is only available in the validation phase,
            // while the execution phase only has access to the nullifier from callData
            require(semaphoreProof.nullifier == nullifier, NullifierMismatch());

            bool isValidProof = _verifyReviewEligibility(title, royaltyLevel, semaphoreProof);

            if (!isValidProof) {
                return SIG_VALIDATION_FAILED;
            }
            return 0;
        }

        /// ========================= Other operations =========================
        /// @dev userOp.signature[0:65]: actual signature
        /// @dev userOp.signature[65:85]: appended signer address
        /// @notice The reason for needing appendedSigner instead of directly using signer is because eth_estimateUserOperationGas uses a dummy signature

        if (userOp.signature.length != 85) {
            revert InvalidSignatureLength();
        }

        bytes memory actualSignature = bytes(userOp.signature[:65]);
        address appendedSigner = address(bytes20(userOp.signature[65:]));
        address signer = ECDSA.recover(userOpHash, actualSignature);

        if (
            // ========================= Owner =========================
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
            // ========================= Admin =========================
            selector == this.adminRegisterSubmission.selector || selector == this.adminUpdateRoyaltyRecipient.selector
                || selector == this.revokeSubmission.selector || selector == this.updateEmailVerifier.selector
        ) {
            require(appendedSigner == admin(), Unauthorized(appendedSigner));
            if (signer != appendedSigner) {
                return SIG_VALIDATION_FAILED;
            }
            return 0;
        } else if ( // ========================= Claim (Recipient or Admin) =========================
            selector == this.claimRoyalty.selector
        ) {
            (string memory title) = abi.decode(userOp.callData[4:], (string));
            _requireClaimable(title, appendedSigner);

            if (signer != appendedSigner) {
                return SIG_VALIDATION_FAILED;
            }
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

    function semaphore() public view returns (ISemaphore) {
        return _getMainStorage().configs.semaphore;
    }

    function reviewerGroupId() public view returns (uint256) {
        return _getMainStorage().configs.reviewerGroupId;
    }

    function submissions(string memory title) public view returns (Submission memory) {
        return _getMainStorage().submissions[title];
    }

    function emailVerifier() public view returns (address) {
        return address(_getMainStorage().configs.emailVerifier);
    }

    function isAdmin(address caller) public view returns (bool) {
        return _getMainStorage().configs.admin == caller;
    }

    function isRecipient(string memory title, address recipient) public view returns (bool) {
        return _getMainStorage().submissions[title].royaltyRecipient == recipient;
    }

    function isEmailProofUsed(bytes32 emailHeaderHash) public view returns (bool) {
        return _getMainStorage().emailNullifierHashes[emailHeaderHash];
    }

    function hasReviewed(string memory title, uint256 nullifier) public view returns (bool) {
        return _getMainStorage().hasReviewed[title][nullifier];
    }

    function isEmailRevoked(uint256 number) public view returns (bool) {
        return _getMainStorage().revokedEmailNumbers[number];
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
