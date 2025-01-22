// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {Test} from "forge-std/Test.sol";
import {RoyaltyAutoClaimProxy} from "../src/RoyaltyAutoClaimProxy.sol";

contract MockImplementation {
    bool private _initialized;

    function initialize() public {
        _initialized = true;
    }

    function isInitialized() public view returns (bool) {
        return _initialized;
    }
}

contract RoyaltyAutoClaimProxyTest is Test {
    function test_initialization() public {
        RoyaltyAutoClaimProxy proxy = new RoyaltyAutoClaimProxy(
            address(new MockImplementation()), abi.encodeCall(MockImplementation.initialize, ())
        );
        MockImplementation proxied = MockImplementation(address(proxy));
        assertTrue(proxied.isInitialized());
    }

    function test_invalid_initialization() public {
        MockImplementation impl = new MockImplementation();
        bytes memory invalidData = abi.encodeWithSignature("nonexistentFunction()");
        vm.expectRevert();
        new RoyaltyAutoClaimProxy(address(impl), invalidData);
    }
}
