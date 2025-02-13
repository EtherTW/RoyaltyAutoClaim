// SPDX-License-Identifier: MIT
pragma solidity ^0.8.13;

import {Script, console} from "forge-std/Script.sol";
import {MockToken} from "../src/MockToken.sol";

/*
    forge script script/deployMockToken.s.sol --rpc-url $sepolia --broadcast --verify
*/

contract DeployMockTokenScript is Script {
    function run() public {
        uint256 privateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(privateKey);

        vm.startBroadcast(privateKey);

        MockToken mockToken = new MockToken(deployer, 10000 ether);

        console.log("MockToken at:", address(mockToken));

        vm.stopBroadcast();
    }
}
