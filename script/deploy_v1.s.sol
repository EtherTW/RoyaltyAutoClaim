// SPDX-License-Identifier: MIT
pragma solidity ^0.8.13;

import {Script, console} from "forge-std/Script.sol";
import {UUPSProxy, RoyaltyAutoClaim} from "../src/RoyaltyAutoClaim.sol";

// forge script script/deploy_v1.s.sol --account dev --rpc-url $sepolia --broadcast --verify

contract DeployV1Script is Script {
    function run() public {
        address owner = msg.sender;
        address admin = msg.sender;
        address token = 0x0000000000000000000000000000000000000000;
        address[] memory reviewers = new address[](0);

        vm.startBroadcast();

        RoyaltyAutoClaim royaltyAutoClaim = new RoyaltyAutoClaim();
        UUPSProxy proxy = new UUPSProxy(
            address(royaltyAutoClaim), abi.encodeCall(RoyaltyAutoClaim.initialize, (owner, admin, token, reviewers))
        );

        console.log("RoyaltyAutoClaim proxy at:", address(proxy));
        console.log("RoyaltyAutoClaim implementation at:", address(royaltyAutoClaim));

        vm.stopBroadcast();
    }
}
