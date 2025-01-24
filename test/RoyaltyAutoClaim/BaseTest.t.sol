// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "../../src/RoyaltyAutoClaim.sol";
import "../../src/RoyaltyAutoClaimProxy.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC1967Utils} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Utils.sol";
import "../utils/AATest.t.sol";

contract MockERC20 is ERC20 {
    constructor(address owner) ERC20("Test", "TEST") {
        _mint(owner, 100 ether);
    }
}

abstract contract BaseTest is AATest {
    address owner;
    uint256 ownerKey;
    address newOwner;
    uint256 newOwnerKey;
    address fake;
    uint256 fakeKey;
    address admin;
    uint256 adminKey;
    address reviewer1;
    uint256 reviewer1Key;
    address reviewer2;
    uint256 reviewer2Key;
    address submitter;
    uint256 submitterKey;

    address[] initialReviewers = new address[](2);

    RoyaltyAutoClaim impl;
    RoyaltyAutoClaimProxy proxy;
    RoyaltyAutoClaim royaltyAutoClaim;

    IERC20 token;
    address constant NATIVE_TOKEN = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;
    address constant ENTRY_POINT = 0x0000000071727De22E5E9d8BAf0edAc6f37da032;

    function setUp() public virtual override {
        super.setUp();
        (owner, ownerKey) = makeAddrAndKey("owner");
        (newOwner, newOwnerKey) = makeAddrAndKey("newOwner");
        (fake, fakeKey) = makeAddrAndKey("fake");
        (admin, adminKey) = makeAddrAndKey("admin");
        (reviewer1, reviewer1Key) = makeAddrAndKey("reviewer1");
        (reviewer2, reviewer2Key) = makeAddrAndKey("reviewer2");
        (submitter, submitterKey) = makeAddrAndKey("submitter");

        initialReviewers[0] = reviewer1;
        initialReviewers[1] = reviewer2;

        token = new MockERC20(owner);

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

        console.log("owner", owner);
        console.log("admin", admin);
        console.log("reviewer 0", initialReviewers[0]);
        console.log("reviewer 1", initialReviewers[1]);
    }
}
