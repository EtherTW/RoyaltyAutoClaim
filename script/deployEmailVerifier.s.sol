// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Script, console} from "forge-std/Script.sol";
import {IDKIMRegistry} from "@zk-email/contracts/interfaces/IDKIMRegistry.sol";
import {EmailVerifier} from "../src/EmailVerifier.sol";

/*

forge script script/deployEmailVerifier.s.sol --rpc-url https://sepolia.base.org --broadcast --verify

zkemail deployed contracts: https://docs.zk.email/account-recovery/deployed-contracts

*/

contract DeployEmailVerifierScript is Script {
    function run() public {
        address deployer = vm.rememberKey(vm.envUint("PRIVATE_KEY"));
        console.log("Deployer", deployer);

        string memory root = vm.projectRoot();
        string memory path = string.concat(root, "/deploy.json");
        string memory json = vm.readFile(path);

        address dkimRegistryAddr = vm.parseJsonAddress(json, ".EmailVerifier.dkimRegistry");
        string memory emailFromAddress = vm.parseJsonString(json, ".EmailVerifier.emailFromAddress");

        vm.startBroadcast(deployer);

        IDKIMRegistry dkimRegistry = IDKIMRegistry(dkimRegistryAddr);
        EmailVerifier emailVerifier = new EmailVerifier(dkimRegistry, keccak256(abi.encodePacked(emailFromAddress)));

        vm.stopBroadcast();

        console.log("Deployed DKIMRegistry at", address(dkimRegistry));
        console.log("Deployed EmailVerifier at", address(emailVerifier));
    }
}
