// SPDX-License-Identifier: MIT
pragma solidity ^0.8.13;

import {Script, console} from "forge-std/Script.sol";
import {RoyaltyAutoClaim} from "../src/RoyaltyAutoClaim.sol";
import {RoyaltyAutoClaimProxy} from "../src/RoyaltyAutoClaimProxy.sol";
import {IRegistrationVerifier} from "../src/RegistrationVerifier.sol";

/*

forge script script/deployRoyaltyAutoClaim.s.sol --rpc-url https://sepolia.base.org --broadcast --verify

*/

contract DeployRoyaltyAutoClaimScript is Script {
    function run() public {
        address deployer = vm.rememberKey(vm.envUint("PRIVATE_KEY"));
        console.log("Deployer", deployer);

        string memory json = vm.readFile(string.concat(vm.projectRoot(), "/deploy.json"));
        address owner = vm.parseJsonAddress(json, ".RoyaltyAutoClaim.owner");
        address admin = vm.parseJsonAddress(json, ".RoyaltyAutoClaim.admin");
        address token = vm.parseJsonAddress(json, ".RoyaltyAutoClaim.token");
        address[] memory reviewers = vm.parseJsonAddressArray(json, ".RoyaltyAutoClaim.reviewers");
        address verifierAddr = vm.parseJsonAddress(json, ".RoyaltyAutoClaim.verifier");

        vm.startBroadcast(deployer);

        IRegistrationVerifier verifier = IRegistrationVerifier(verifierAddr);
        RoyaltyAutoClaim royaltyAutoClaim = new RoyaltyAutoClaim();
        RoyaltyAutoClaimProxy proxy = new RoyaltyAutoClaimProxy(
            address(royaltyAutoClaim),
            abi.encodeCall(RoyaltyAutoClaim.initialize, (owner, admin, token, reviewers, verifier))
        );

        console.log("RoyaltyAutoClaim implementation at:", address(royaltyAutoClaim));
        console.log("RoyaltyAutoClaim proxy at:", address(proxy));

        vm.stopBroadcast();
    }
}
