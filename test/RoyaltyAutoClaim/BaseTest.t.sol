// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import "../../src/RoyaltyAutoClaim.sol";
import "../../src/RoyaltyAutoClaimProxy.sol";
import "../utils/AATest.t.sol";
import {ERC1967Utils} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Utils.sol";
import {MockToken} from "../../src/MockToken.sol";
import {ZKTest} from "../utils/ZKTest.sol";
import {MockRegistrationVerifier} from "../utils/MockRegistrationVerifier.sol";
import {MockDKIMRegistry} from "../utils/MockDKIMRegistry.sol";
import {IDKIMRegistry} from "@zk-email/contracts/interfaces/IDKIMRegistry.sol";
import {IRegistrationVerifier, RegistrationVerifier} from "../../src/RegistrationVerifier.sol";
import {ISemaphore} from "../../lib/semaphore/packages/contracts/contracts/interfaces/ISemaphore.sol";
import {MockSemaphore} from "../utils/MockSemaphore.sol";

/// @dev for testing internal functions
contract RoyaltyAutoClaimHarness is RoyaltyAutoClaim {}

abstract contract BaseTest is AATest, ZKTest {
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

    IRegistrationVerifier public mockRegistrationVerifier;
    IDKIMRegistry public mockDKIMRegistry;
    IRegistrationVerifier public registrationVerifier;

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

        mockRegistrationVerifier = new MockRegistrationVerifier();
        mockDKIMRegistry = new MockDKIMRegistry();
        registrationVerifier = new RegistrationVerifier(mockDKIMRegistry, keccak256("johnson86tw"));

        mockSemaphore = new MockSemaphore();

        impl = new RoyaltyAutoClaim();
        proxy = new RoyaltyAutoClaimProxy(
            address(impl),
            abi.encodeCall(
                RoyaltyAutoClaim.initialize, (owner, admin, address(token), mockRegistrationVerifier, mockSemaphore)
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

    function _registerSubmission(string memory _title, address _recipient) internal {
        royaltyAutoClaim.registerSubmission(_title, _recipient, bytes32(vm.randomUint()), validRegistrationProof());
    }

    function _registerSubmission4337(string memory _title, address _recipient) public {
        PackedUserOperation memory userOp = _buildUserOpWithoutSignature(
            address(royaltyAutoClaim),
            abi.encodeCall(IRoyaltyAutoClaim.registerSubmission, (_title, _recipient, bytes32(vm.randomUint())))
        );

        userOp.signature = abi.encode(validRegistrationProof());

        _handleUserOp(userOp);
    }

    function _updateRoyaltyRecipient(string memory _title, address _recipient) internal {
        royaltyAutoClaim.updateRoyaltyRecipient(
            _title, _recipient, bytes32(vm.randomUint()), validRecipientUpdateProof()
        );
    }

    function _updateRoyaltyRecipient4337(string memory _title, address _recipient) public {
        PackedUserOperation memory userOp = _buildUserOpWithoutSignature(
            address(royaltyAutoClaim),
            abi.encodeCall(IRoyaltyAutoClaim.updateRoyaltyRecipient, (_title, _recipient, bytes32(vm.randomUint())))
        );

        userOp.signature = abi.encode(validRecipientUpdateProof());

        _handleUserOp(userOp);
    }

    /// @dev Deploy a separate RoyaltyAutoClaim instance with real RegistrationVerifier for ZK proof testing
    function _deployWithRealVerifier() internal returns (RoyaltyAutoClaim) {
        RoyaltyAutoClaim realImpl = new RoyaltyAutoClaim();
        RoyaltyAutoClaimProxy realProxy = new RoyaltyAutoClaimProxy(
            address(realImpl),
            abi.encodeCall(
                RoyaltyAutoClaim.initialize, (owner, admin, address(token), registrationVerifier, mockSemaphore)
            )
        );

        vm.deal(address(realProxy), 100 ether);

        // Deal tokens directly to the new contract instead of transferring from owner
        deal(address(token), address(realProxy), 10 ether);

        return RoyaltyAutoClaim(payable(address(realProxy)));
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
