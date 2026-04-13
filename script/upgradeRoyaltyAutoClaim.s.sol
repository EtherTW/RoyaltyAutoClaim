// SPDX-License-Identifier: MIT
pragma solidity ^0.8.13;

import {Script, console} from "forge-std/Script.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

/*
    PROXY_ADDRESS=0x... NEW_IMPL=0x... \
    forge script script/upgradeRoyaltyAutoClaim.s.sol --rpc-url $NETWORK --broadcast
*/

contract UpgradeRoyaltyAutoClaimScript is Script {
    function run() public {
        address deployer = vm.rememberKey(vm.envUint("PRIVATE_KEY"));
        address proxy = vm.envAddress("PROXY_ADDRESS");
        address newImpl = vm.envAddress("NEW_IMPL");

        console.log("Deployer:", deployer);
        console.log("Proxy:", proxy);

        address currentImpl = _getImplementation(proxy);
        console.log("Current implementation:", currentImpl);
        console.log("New implementation:", newImpl);

        vm.startBroadcast(deployer);

        // Pass empty data if no re-initialization is needed.
        // If re-initialization is needed, encode the call:
        //   abi.encodeCall(RoyaltyAutoClaimV2.reinitialize, (...args))
        UUPSUpgradeable(proxy).upgradeToAndCall(newImpl, "");

        vm.stopBroadcast();

        address updatedImpl = _getImplementation(proxy);
        console.log("Updated implementation:", updatedImpl);
        require(updatedImpl == newImpl, "Upgrade verification failed");
        console.log("Upgrade successful!");
    }

    function _getImplementation(address proxy) internal view returns (address) {
        bytes32 slot = 0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc;
        return address(uint160(uint256(vm.load(proxy, slot))));
    }
}
