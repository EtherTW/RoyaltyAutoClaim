// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import "../../src/RoyaltyAutoClaim.sol";
import "../../src/RoyaltyAutoClaimProxy.sol";
import "../utils/AATest.t.sol";
import {ERC1967Utils} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Utils.sol";
import {MockToken} from "../../src/MockToken.sol";
import {MockEmailVerifier} from "../utils/MockEmailVerifier.sol";
import {MockDKIMRegistry} from "../utils/MockDKIMRegistry.sol";
import {IDKIMRegistry} from "@zk-email/contracts/interfaces/IDKIMRegistry.sol";
import {IEmailVerifier, EmailVerifier} from "../../src/EmailVerifier.sol";
import {ISemaphore} from "../../lib/semaphore/packages/contracts/contracts/interfaces/ISemaphore.sol";
import {MockSemaphore} from "../utils/MockSemaphore.sol";
import {TitleHashVerifierLib} from "../../src/verifiers/TitleHashVerifierLib.sol";

/// @dev for testing internal functions
contract RoyaltyAutoClaimHarness is RoyaltyAutoClaim {}

abstract contract BaseTest is AATest {
    address fake;
    uint256 fakeKey;
    address owner;
    uint256 ownerKey;
    address newOwner;
    uint256 newOwnerKey;
    address admin;
    uint256 adminKey;
    address newAdmin;
    uint256 newAdminKey;
    address reviewer1;
    uint256 reviewer1Key;
    address reviewer2;
    uint256 reviewer2Key;
    address recipient;
    uint256 recipientKey;

    ISemaphore mockSemaphore;

    // Reviewer identity commitments (Semaphore identities)
    uint256 reviewer1Identity = uint256(keccak256("reviewer1_identity"));
    uint256 reviewer2Identity = uint256(keccak256("reviewer2_identity"));

    // Nullifiers for testing (unique per review)
    uint256 reviewer1Nullifier1 = uint256(keccak256("reviewer1_nullifier_1"));
    uint256 reviewer1Nullifier2 = uint256(keccak256("reviewer1_nullifier_2"));
    uint256 reviewer2Nullifier1 = uint256(keccak256("reviewer2_nullifier_1"));
    uint256 reviewer2Nullifier2 = uint256(keccak256("reviewer2_nullifier_2"));

    IEmailVerifier public mockEmailVerifier;
    IDKIMRegistry public mockDKIMRegistry;

    RoyaltyAutoClaim impl;
    RoyaltyAutoClaimProxy proxy;
    RoyaltyAutoClaim royaltyAutoClaim;

    IERC20 token;
    IERC20 newToken;
    RoyaltyAutoClaimHarness harness;
    address constant NATIVE_TOKEN = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;

    function setUp() public virtual override {
        super.setUp();

        (fake, fakeKey) = makeAddrAndKey("fake");
        (owner, ownerKey) = makeAddrAndKey("owner");
        (newOwner, newOwnerKey) = makeAddrAndKey("newOwner");
        (admin, adminKey) = makeAddrAndKey("admin");
        (newAdmin, newAdminKey) = makeAddrAndKey("newAdmin");
        (reviewer1, reviewer1Key) = makeAddrAndKey("reviewer1");
        (reviewer2, reviewer2Key) = makeAddrAndKey("reviewer2");
        (recipient, recipientKey) = makeAddrAndKey("recipient");

        console.log("fake", fake);
        console.log("owner", owner);
        console.log("admin", admin);
        console.log("reviewer1", reviewer1);
        console.log("reviewer2", reviewer2);
        console.log("recipient", recipient);

        token = new MockToken(owner, 100 ether);
        newToken = new MockToken(owner, 100 ether);

        harness = new RoyaltyAutoClaimHarness();

        mockEmailVerifier = new MockEmailVerifier();
        mockDKIMRegistry = new MockDKIMRegistry();

        mockSemaphore = new MockSemaphore();

        impl = new RoyaltyAutoClaim();
        proxy = new RoyaltyAutoClaimProxy(
            address(impl),
            abi.encodeCall(
                RoyaltyAutoClaim.initialize, (owner, admin, address(token), mockEmailVerifier, mockSemaphore)
            )
        );

        bytes32 v = vm.load(address(proxy), ERC1967Utils.IMPLEMENTATION_SLOT);
        assertEq(address(uint160(uint256(v))), address(impl));

        // deal
        vm.deal(address(proxy), 100 ether);
        vm.prank(owner);
        token.transfer(address(proxy), 100 ether);

        royaltyAutoClaim = RoyaltyAutoClaim(payable(address(proxy)));

        // Add reviewer identities to Semaphore group
        uint256 groupId = royaltyAutoClaim.reviewerGroupId();
        mockSemaphore.addMember(groupId, reviewer1Identity);
        mockSemaphore.addMember(groupId, reviewer2Identity);

        vm.label(ENTRY_POINT, "entryPoint");
        vm.label(fake, "fake");
        vm.label(owner, "owner");
        vm.label(admin, "admin");
        vm.label(newOwner, "newOwner");
        vm.label(newAdmin, "newAdmin");
        vm.label(reviewer1, "reviewer1");
        vm.label(reviewer2, "reviewer2");
        vm.label(recipient, "recipient");
        vm.label(address(token), "token");
        vm.label(address(newToken), "newToken");
        vm.label(address(impl), "impl");
        vm.label(address(royaltyAutoClaim), "royaltyAutoClaim");
        vm.label(address(harness), "harness");
    }

    function _createEmailProof(
        address _recipient,
        bytes32 _nullifier,
        TitleHashVerifierLib.OperationType _operationType,
        bytes32 userOpHash
    ) internal pure returns (TitleHashVerifierLib.EmailProof memory) {
        // Create public inputs array matching circuit output (330 elements)
        bytes32[] memory publicInputs = new bytes32[](330);

        // Set key indices based on circuit output:
        // [0]: pubkey_hash (mock)
        // [1]: nullifier
        // [323]: operation_type (1=REGISTRATION, 2=RECIPIENT_UPDATE)
        // [324]: number (email identifier)
        // [325]: recipient
        // [326-327]: title_hash (upper/lower)
        // [328-329]: user_op_hash (upper/lower)

        // Split userOpHash into upper and lower 128 bits
        bytes32 upper = bytes32(uint256(userOpHash) >> 128);
        bytes32 lower = bytes32(uint256(userOpHash) & ((1 << 128) - 1));

        publicInputs[0] = bytes32(uint256(1)); // mock pubkey_hash
        publicInputs[1] = _nullifier;
        publicInputs[323] = bytes32(uint256(_operationType));
        publicInputs[324] = bytes32(uint256(12345)); // mock email number
        publicInputs[325] = bytes32(uint256(uint160(_recipient)));
        publicInputs[326] = bytes32(0); // title_hash upper
        publicInputs[327] = bytes32(0); // title_hash lower
        publicInputs[328] = upper; // user_op_hash upper
        publicInputs[329] = lower; // user_op_hash lower

        return TitleHashVerifierLib.EmailProof({proof: new bytes(0), publicInputs: publicInputs});
    }

    /// @dev Helper to create an EmailProof with a specific email number (for revocation testing)
    function _createEmailProofWithNumber(
        address _recipient,
        bytes32 _nullifier,
        TitleHashVerifierLib.OperationType _operationType,
        bytes32 userOpHash,
        uint256 _emailNumber
    ) internal pure returns (TitleHashVerifierLib.EmailProof memory) {
        bytes32[] memory publicInputs = new bytes32[](330);

        // Split userOpHash into upper and lower 128 bits
        bytes32 upper = bytes32(uint256(userOpHash) >> 128);
        bytes32 lower = bytes32(uint256(userOpHash) & ((1 << 128) - 1));

        publicInputs[0] = bytes32(uint256(1)); // mock pubkey_hash
        publicInputs[1] = _nullifier;
        publicInputs[323] = bytes32(uint256(_operationType));
        publicInputs[324] = bytes32(_emailNumber); // custom email number
        publicInputs[325] = bytes32(uint256(uint160(_recipient)));
        publicInputs[326] = bytes32(0); // title_hash upper
        publicInputs[327] = bytes32(0); // title_hash lower
        publicInputs[328] = upper; // user_op_hash upper
        publicInputs[329] = lower; // user_op_hash lower

        return TitleHashVerifierLib.EmailProof({proof: new bytes(0), publicInputs: publicInputs});
    }

    /// @dev Helper for direct registration with EmailProof
    function _registerSubmission(string memory _title, address _recipient) internal {
        TitleHashVerifierLib.EmailProof memory proof = _createEmailProof(
            _recipient, bytes32(vm.randomUint()), TitleHashVerifierLib.OperationType.REGISTRATION, bytes32(0)
        );
        royaltyAutoClaim.registerSubmission(_title, proof);
    }

    /// @dev Helper for ERC-4337 registration
    function _registerSubmission4337(string memory _title, address _recipient) public {
        bytes32 nullifier = bytes32(vm.randomUint());

        PackedUserOperation memory userOp = _buildUserOpWithoutSignature(
            address(royaltyAutoClaim),
            abi.encodeCall(IRoyaltyAutoClaim.registerSubmission4337, (_title, _recipient, nullifier))
        );

        // Calculate userOpHash before creating the proof
        bytes32 userOpHash = entryPoint.getUserOpHash(userOp);

        TitleHashVerifierLib.EmailProof memory proof =
            _createEmailProof(_recipient, nullifier, TitleHashVerifierLib.OperationType.REGISTRATION, userOpHash);

        userOp.signature = abi.encode(proof);

        _handleUserOp(userOp);
    }

    /// @dev Helper for direct recipient update with EmailProof
    function _updateRoyaltyRecipient(string memory _title, address _recipient) internal {
        TitleHashVerifierLib.EmailProof memory proof = _createEmailProof(
            _recipient, bytes32(vm.randomUint()), TitleHashVerifierLib.OperationType.RECIPIENT_UPDATE, bytes32(0)
        );
        royaltyAutoClaim.updateRoyaltyRecipient(_title, proof);
    }

    /// @dev Helper for ERC-4337 recipient update
    function _updateRoyaltyRecipient4337(string memory _title, address _recipient) public {
        bytes32 nullifier = bytes32(vm.randomUint());

        PackedUserOperation memory userOp = _buildUserOpWithoutSignature(
            address(royaltyAutoClaim),
            abi.encodeCall(IRoyaltyAutoClaim.updateRoyaltyRecipient4337, (_title, _recipient, nullifier))
        );

        // Calculate userOpHash before creating the proof
        bytes32 userOpHash = entryPoint.getUserOpHash(userOp);

        TitleHashVerifierLib.EmailProof memory proof =
            _createEmailProof(_recipient, nullifier, TitleHashVerifierLib.OperationType.RECIPIENT_UPDATE, userOpHash);

        userOp.signature = abi.encode(proof);

        _handleUserOp(userOp);
    }

    /// @dev Create a valid Semaphore proof for testing
    function _createSemaphoreProof(uint256 nullifier, uint16 royaltyLevel, string memory title)
        internal
        pure
        returns (ISemaphore.SemaphoreProof memory)
    {
        return ISemaphore.SemaphoreProof({
            merkleTreeDepth: 20,
            merkleTreeRoot: uint256(keccak256("mock_root")),
            nullifier: nullifier,
            message: uint256(royaltyLevel),
            scope: uint256(keccak256(abi.encodePacked(title))),
            points: [uint256(1), uint256(2), uint256(3), uint256(4), uint256(5), uint256(6), uint256(7), uint256(8)]
        });
    }

    /// @dev Helper to review a submission with Semaphore proof
    function _reviewSubmissionWithProof(string memory title, uint16 royaltyLevel, uint256 nullifier) internal {
        ISemaphore.SemaphoreProof memory proof = _createSemaphoreProof(nullifier, royaltyLevel, title);
        royaltyAutoClaim.reviewSubmission(title, royaltyLevel, proof);
    }
}
