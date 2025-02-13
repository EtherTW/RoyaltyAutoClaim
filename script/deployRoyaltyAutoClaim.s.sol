// SPDX-License-Identifier: MIT
pragma solidity ^0.8.13;

import {Script, console} from "forge-std/Script.sol";
import {RoyaltyAutoClaim} from "../src/RoyaltyAutoClaim.sol";
import {RoyaltyAutoClaimProxy} from "../src/RoyaltyAutoClaimProxy.sol";

/*
    forge script script/deployRoyaltyAutoClaim.s.sol --rpc-url $sepolia --broadcast --verify
*/

contract DeployRoyaltyAutoClaimScript is Script {
    function run() public {
        uint256 privateKey = vm.envUint("PRIVATE_KEY");

        address owner = 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266; // anvil account 0
        address admin = 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266; // anvil account 0
        address token = 0x1dE2CEc5d130deCF60207f45f7cEfDAE224F0559; // mock token

        address[] memory reviewers = new address[](5);
        reviewers[0] = 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266; // anvil account 0
        reviewers[1] = 0x70997970C51812dc3A010C7d01b50e0d17dc79C8; // anvil account 1
        reviewers[2] = 0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC; // anvil account 2
        reviewers[3] = 0x90F79bf6EB2c4f870365E785982E1f101E93b906; // anvil account 3
        reviewers[4] = 0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65; // anvil account 4

        vm.startBroadcast(privateKey);

        RoyaltyAutoClaim royaltyAutoClaim = new RoyaltyAutoClaim();
        RoyaltyAutoClaimProxy proxy = new RoyaltyAutoClaimProxy(
            address(royaltyAutoClaim), abi.encodeCall(RoyaltyAutoClaim.initialize, (owner, admin, token, reviewers))
        );

        console.log("RoyaltyAutoClaim implementation at:", address(royaltyAutoClaim));
        console.log("RoyaltyAutoClaim proxy at:", address(proxy));

        vm.stopBroadcast();
    }
}
