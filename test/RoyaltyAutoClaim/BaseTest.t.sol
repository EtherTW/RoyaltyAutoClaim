// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "../../src/RoyaltyAutoClaim.sol";
import "../../src/RoyaltyAutoClaimProxy.sol";
import {ERC1967Utils} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Utils.sol";
import "../utils/AATest.t.sol";
import {MockToken} from "../../src/MockToken.sol";

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

    address[] initialReviewers = new address[](2);

    RoyaltyAutoClaim impl;
    RoyaltyAutoClaimProxy proxy;
    RoyaltyAutoClaim royaltyAutoClaim;

    IERC20 token;
    IERC20 newToken;

    address constant NATIVE_TOKEN = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;
    address constant ENTRY_POINT = 0x0000000071727De22E5E9d8BAf0edAc6f37da032;

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

        initialReviewers[0] = reviewer1;
        initialReviewers[1] = reviewer2;

        console.log("fake", fake);
        console.log("owner", owner);
        console.log("admin", admin);
        console.log("reviewer1", reviewer1);
        console.log("reviewer2", reviewer2);
        console.log("recipient", recipient);

        token = new MockToken(owner, 100 ether);
        newToken = new MockToken(owner, 100 ether);

        impl = new RoyaltyAutoClaim();
        proxy = new RoyaltyAutoClaimProxy(
            address(impl), abi.encodeCall(RoyaltyAutoClaim.initialize, (owner, admin, address(token), initialReviewers))
        );

        bytes32 v = vm.load(address(proxy), ERC1967Utils.IMPLEMENTATION_SLOT);
        assertEq(address(uint160(uint256(v))), address(impl));

        // deal
        vm.deal(address(proxy), 100 ether);
        vm.prank(owner);
        token.transfer(address(proxy), 100 ether);

        royaltyAutoClaim = RoyaltyAutoClaim(payable(address(proxy)));
    }
}
