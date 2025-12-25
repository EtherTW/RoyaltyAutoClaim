// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Script, console} from "forge-std/Script.sol";
import {MockToken} from "../src/MockToken.sol";

/*
    forge script script/deployMockToken.s.sol --rpc-url $NETWORK --broadcast --verify
*/

contract DeployMockTokenScript is Script {
    function run() public {
        address deployer = vm.rememberKey(vm.envUint("PRIVATE_KEY"));
        console.log("Deployer", deployer);

        vm.startBroadcast(deployer);

        MockToken mockToken = new MockToken(deployer, 10000 ether);

        console.log("MockToken at:", address(mockToken));

        vm.stopBroadcast();
    }
}
