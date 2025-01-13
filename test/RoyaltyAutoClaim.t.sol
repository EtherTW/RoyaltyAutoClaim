// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "../src/RoyaltyAutoClaim.sol";
import "../src/RoyaltyAutoClaimProxy.sol";
import "./MockV2.sol";
import "./AATest.t.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockERC20 is ERC20 {
    constructor(address owner) ERC20("Test", "TEST") {
        _mint(owner, 100 ether);
    }
}

contract RoyaltyAutoClaimTest is AATest {
    address owner = vm.addr(1);
    address admin = vm.addr(2);
    address[] reviewers = new address[](3);

    RoyaltyAutoClaim royaltyAutoClaim;
    RoyaltyAutoClaimProxy proxy;
    IERC20 token;

    function setUp() public override {
        super.setUp();

        reviewers[0] = vm.addr(3);
        reviewers[1] = vm.addr(4);

        token = new MockERC20(owner);

        royaltyAutoClaim = new RoyaltyAutoClaim();
        proxy = new RoyaltyAutoClaimProxy(
            address(royaltyAutoClaim),
            abi.encodeCall(RoyaltyAutoClaim.initialize, (owner, admin, address(token), reviewers))
        );

        bytes32 v = vm.load(address(proxy), ERC1967Utils.IMPLEMENTATION_SLOT);
        assertEq(address(uint160(uint256(v))), address(royaltyAutoClaim));

        // deal
        vm.deal(address(proxy), 100 ether);
        vm.prank(owner);
        token.transfer(address(proxy), 100 ether);

        // log
        console.log("owner", owner);
        console.log("admin", admin);
        console.log("reviewer 0", reviewers[0]);
        console.log("reviewer 1", reviewers[1]);
    }

    function test_simple_flow() public {
        address submitter = vm.randomAddress();
        vm.prank(admin);
        RoyaltyAutoClaim(address(proxy)).registerSubmission("test", submitter);

        RoyaltyAutoClaim.Submission memory submission = RoyaltyAutoClaim(address(proxy)).submissions("test");
        assertEq(submission.royaltyRecipient, submitter, "Royalty recipient should be submitter");
        assertEq(submission.reviewCount, 0, "Review count should be 0");
        assertEq(submission.totalRoyaltyLevel, 0, "Total royalty level should be 0");
        assertEq(
            uint256(submission.status),
            uint256(RoyaltyAutoClaim.SubmissionStatus.Registered),
            "Submission status should be Registered"
        );

        vm.expectRevert();
        RoyaltyAutoClaim(address(proxy)).claimRoyalty("test");

        vm.prank(reviewers[0]);
        RoyaltyAutoClaim(address(proxy)).reviewSubmission("test", 20);

        vm.expectRevert();
        RoyaltyAutoClaim(address(proxy)).claimRoyalty("test");
        assertEq(RoyaltyAutoClaim(address(proxy)).getRoyalty("test"), 0 ether, "Royalty should be 0");

        vm.prank(reviewers[1]);
        RoyaltyAutoClaim(address(proxy)).reviewSubmission("test", 40);

        assertEq(RoyaltyAutoClaim(address(proxy)).getRoyalty("test"), 30 ether, "Royalty should be 30 ether");

        uint256 proxyBalanceBefore = token.balanceOf(address(proxy));

        RoyaltyAutoClaim(address(proxy)).claimRoyalty("test");

        uint256 proxyBalanceAfter = token.balanceOf(address(proxy));

        assertEq(token.balanceOf(submitter), 30 ether, "Submitter should have 30 ether");
        assertEq(proxyBalanceAfter, proxyBalanceBefore - 30 ether, "Proxy balance should be 30 ether less");
    }

    function test_upgradeToAndCall() public {
        address newOwner = vm.randomAddress();
        MockV2 v2 = new MockV2();

        vm.prank(vm.addr(0xbeef));
        vm.expectRevert();
        MockV2(address(proxy)).upgradeToAndCall(address(v2), abi.encodeCall(MockV2.initialize, (newOwner)));

        vm.prank(owner);
        MockV2(address(proxy)).upgradeToAndCall(address(v2), abi.encodeCall(MockV2.initialize, (newOwner)));
        bytes32 v = vm.load(address(proxy), ERC1967Utils.IMPLEMENTATION_SLOT);
        assertEq(address(uint160(uint256(v))), address(v2));
    }

    function test_upgradeToAndCall_4337() public {
        address newOwner = vm.randomAddress();
        MockV2 v2 = new MockV2();

        PackedUserOperation memory userOp = buildUserOp(
            0xbeef,
            abi.encodeCall(
                royaltyAutoClaim.upgradeToAndCall, (address(v2), abi.encodeCall(MockV2.initialize, (newOwner)))
            )
        );
        vm.expectRevert(
            abi.encodeWithSelector(
                IEntryPoint.FailedOpWithRevert.selector,
                0,
                "AA23 reverted",
                abi.encodeWithSelector(RoyaltyAutoClaim.Unauthorized.selector, vm.addr(0xbeef))
            )
        );
        handleUserOp(userOp);

        userOp = buildUserOp(
            1,
            abi.encodeCall(
                royaltyAutoClaim.upgradeToAndCall, (address(v2), abi.encodeCall(MockV2.initialize, (newOwner)))
            )
        );
        handleUserOp(userOp);
        assertEq(address(uint160(uint256(vm.load(address(proxy), ERC1967Utils.IMPLEMENTATION_SLOT)))), address(v2));
    }

    // ======================================== registerSubmission ========================================

    function test_registerSubmission() public {
        address submitter = vm.randomAddress();
        vm.prank(admin);
        RoyaltyAutoClaim(address(proxy)).registerSubmission("test", submitter);
        RoyaltyAutoClaim.Submission memory submission = RoyaltyAutoClaim(address(proxy)).submissions("test");
        assertEq(submission.royaltyRecipient, submitter, "Royalty recipient should be the submitter");
        assertEq(submission.reviewCount, 0, "Review count should be 0");
        assertEq(submission.totalRoyaltyLevel, 0, "Total royalty level should be 0");
        assertEq(
            uint256(submission.status),
            uint256(RoyaltyAutoClaim.SubmissionStatus.Registered),
            "Submission status should be Registered"
        );
    }

    function testCannot_registerSubmission_if_the_submission_already_exists_or_is_claimed() public {
        vm.prank(admin);
        RoyaltyAutoClaim(address(proxy)).registerSubmission("test", vm.randomAddress());

        vm.prank(admin);
        vm.expectRevert(); // submission already exists
        RoyaltyAutoClaim(address(proxy)).registerSubmission("test", vm.randomAddress());

        vm.prank(reviewers[0]);
        RoyaltyAutoClaim(address(proxy)).reviewSubmission("test", 20);
        vm.prank(reviewers[1]);
        RoyaltyAutoClaim(address(proxy)).reviewSubmission("test", 40);
        RoyaltyAutoClaim(address(proxy)).claimRoyalty("test");

        vm.expectRevert(); // submission is claimed
        RoyaltyAutoClaim(address(proxy)).registerSubmission("test", vm.randomAddress());
    }

    function testCannot_registerSubmission_if_not_admin() public {
        vm.prank(vm.randomAddress());
        vm.expectRevert();
        RoyaltyAutoClaim(address(proxy)).registerSubmission("test", vm.randomAddress());
    }

    // ======================================== updateRoyaltyRecipient ========================================

    function testCannot_updateRoyaltyRecipient_if_the_submission_is_claimed_or_not_exist() public {
        vm.expectRevert(); // submission not exist
        RoyaltyAutoClaim(address(proxy)).updateRoyaltyRecipient("test", vm.randomAddress());

        vm.prank(admin);
        RoyaltyAutoClaim(address(proxy)).registerSubmission("test", vm.randomAddress());
        vm.prank(reviewers[0]);
        RoyaltyAutoClaim(address(proxy)).reviewSubmission("test", 20);
        vm.prank(reviewers[1]);
        RoyaltyAutoClaim(address(proxy)).reviewSubmission("test", 40);
        RoyaltyAutoClaim(address(proxy)).claimRoyalty("test");

        vm.expectRevert();
        RoyaltyAutoClaim(address(proxy)).updateRoyaltyRecipient("test", vm.randomAddress());
    }

    // ======================================== revokeSubmission ========================================

    function testCannot_revokeSubmission_if_the_submission_is_claimed_or_not_exist() public {
        vm.expectRevert(); // submission not exist
        RoyaltyAutoClaim(address(proxy)).revokeSubmission("test");

        vm.prank(admin);
        RoyaltyAutoClaim(address(proxy)).registerSubmission("test", vm.randomAddress());
        vm.prank(reviewers[0]);
        RoyaltyAutoClaim(address(proxy)).reviewSubmission("test", 20);
        vm.prank(reviewers[1]);
        RoyaltyAutoClaim(address(proxy)).reviewSubmission("test", 40);
        RoyaltyAutoClaim(address(proxy)).claimRoyalty("test");

        vm.expectRevert();
        RoyaltyAutoClaim(address(proxy)).revokeSubmission("test");
    }

    // ======================================== reviewSubmission ========================================

    function testCannot_reviewSubmission_if_the_submission_is_claimed_or_not_exist() public {
        vm.expectRevert(); // submission not exist
        RoyaltyAutoClaim(address(proxy)).reviewSubmission("test", 20);

        vm.prank(admin);
        RoyaltyAutoClaim(address(proxy)).registerSubmission("test", vm.randomAddress());
        vm.prank(reviewers[0]);
        RoyaltyAutoClaim(address(proxy)).reviewSubmission("test", 20);
        vm.prank(reviewers[1]);
        RoyaltyAutoClaim(address(proxy)).reviewSubmission("test", 40);
        RoyaltyAutoClaim(address(proxy)).claimRoyalty("test");

        vm.expectRevert(); // submission claimed
        RoyaltyAutoClaim(address(proxy)).reviewSubmission("test", 20);
    }

    // ======================================== validateUserOp ========================================

    function testCannot_validateUserOp_not_from_entrypoint() public {
        PackedUserOperation memory userOp = buildUserOp(1, bytes(""));
        vm.expectRevert(abi.encodeWithSelector(RoyaltyAutoClaim.NotFromEntryPoint.selector));
        RoyaltyAutoClaim(address(proxy)).validateUserOp(userOp, 0, 0);
    }

    function testCannot_validateUserOp_with_paymaster_data() public {
        PackedUserOperation memory userOp = buildUserOp(1, bytes(""));
        userOp.paymasterAndData = bytes(
            hex"0000000000000039cd5e8ae05257ce51c473ddd100000000000000000000000000009d4600000000000000000000000000000001000000678490690000000000005aa567cab83dfbb6ccc8667789beb8c8311b3653c2e8b332f22717de496424df34b457b1a0283058d007bf3303f754480efc66c4d04b46b0697d203ba8105a401c"
        );
        vm.expectRevert(
            abi.encodeWithSelector(
                IEntryPoint.FailedOpWithRevert.selector,
                0,
                "AA23 reverted",
                abi.encodeWithSelector(RoyaltyAutoClaim.ForbiddenPaymaster.selector)
            )
        );
        handleUserOp(userOp);
    }

    // ======================================== internal functions ========================================

    function buildUserOp(uint256 privateKey, bytes memory callData)
        internal
        view
        returns (PackedUserOperation memory)
    {
        PackedUserOperation memory userOp = createUserOp();
        userOp.sender = address(proxy);
        userOp.nonce = entryPoint.getNonce(address(proxy), 0);
        userOp.callData = callData;
        (uint8 v, bytes32 r, bytes32 s) =
            vm.sign(privateKey, ECDSA.toEthSignedMessageHash(entryPoint.getUserOpHash(userOp)));
        userOp.signature = abi.encodePacked(r, s, v);
        return userOp;
    }
}
