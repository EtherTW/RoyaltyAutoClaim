// SPDX-License-Identifier: MIT
pragma solidity ^0.8.13;

import {Script, console} from "forge-std/Script.sol";
import {RoyaltyAutoClaim} from "../src/RoyaltyAutoClaim.sol";

/*
    forge script script/deployNewImpl.s.sol --rpc-url $NETWORK --broadcast --verify
*/

contract DeployNewImplScript is Script {
    function run() public {
        address deployer = vm.rememberKey(vm.envUint("PRIVATE_KEY"));
        console.log("Deployer:", deployer);

        vm.startBroadcast(deployer);

        RoyaltyAutoClaim newImpl = new RoyaltyAutoClaim();
        console.log("New implementation:", address(newImpl));

        vm.stopBroadcast();
    }
}
