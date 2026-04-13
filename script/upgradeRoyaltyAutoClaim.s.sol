// SPDX-License-Identifier: MIT
pragma solidity ^0.8.13;

import {Script, console} from "forge-std/Script.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

/*
    Broadcast mode (requires PRIVATE_KEY in env):
        PROXY_ADDRESS=0x... NEW_IMPL=0x... \
        forge script script/upgradeRoyaltyAutoClaim.s.sol --rpc-url $NETWORK --broadcast

    Calldata-only mode (for submitting via external wallet — no PRIVATE_KEY needed):
        PROXY_ADDRESS=0x... NEW_IMPL=0x... \
        forge script script/upgradeRoyaltyAutoClaim.s.sol --rpc-url $NETWORK
*/

contract UpgradeRoyaltyAutoClaimScript is Script {
    function run() public {
        address proxy = vm.envAddress("PROXY_ADDRESS");
        address newImpl = vm.envAddress("NEW_IMPL");

        console.log("Proxy:", proxy);

        address currentImpl = _getImplementation(proxy);
        console.log("Current implementation:", currentImpl);
        console.log("New implementation:", newImpl);

        // Pass empty data if no re-initialization is needed.
        // If re-initialization is needed, encode the call:
        //   abi.encodeCall(RoyaltyAutoClaimV2.reinitialize, (...args))
        bytes memory callData = abi.encodeCall(UUPSUpgradeable.upgradeToAndCall, (newImpl, ""));

        console.log("--- Upgrade transaction ---");
        console.log("To:", proxy);
        console.log("Value: 0");
        console.log("Data:");
        console.logBytes(callData);
        console.log("---------------------------");

        uint256 pk = vm.envOr("PRIVATE_KEY", uint256(0));
        if (pk == 0) {
            console.log("PRIVATE_KEY not set - submit the calldata above via your wallet.");
            return;
        }

        address deployer = vm.rememberKey(pk);
        console.log("Deployer:", deployer);

        vm.startBroadcast(deployer);
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
