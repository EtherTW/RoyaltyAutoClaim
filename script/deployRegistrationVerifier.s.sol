// SPDX-License-Identifier: MIT
pragma solidity ^0.8.13;

import {Script, console} from "forge-std/Script.sol";
import "@zk-email/contracts/interfaces/IDKIMRegistry.sol";
import "@zk-email/contracts/DKIMRegistry.sol";
import {RegistrationVerifier} from "../src/RegistrationVerifier.sol";

/*

forge script script/deployRegistrationVerifier.s.sol --rpc-url https://sepolia.base.org --broadcast --verify

zkemail deployed contracts: https://docs.zk.email/account-recovery/deployed-contracts

*/

contract DeployRegistrationVerifierScript is Script {
    function run() public {
        address deployer = vm.rememberKey(vm.envUint("PRIVATE_KEY"));
        console.log("Deployer", deployer);

        string memory root = vm.projectRoot();
        string memory path = string.concat(root, "/deploy.json");
        string memory json = vm.readFile(path);

        address dkimRegistryAddr = vm.parseJsonAddress(json, ".RegistrationVerifier.dkimRegistry");
        string memory emailSender = vm.parseJsonString(json, ".RegistrationVerifier.emailSender");

        vm.startBroadcast(deployer);

        IDKIMRegistry dkimRegistry = IDKIMRegistry(dkimRegistryAddr);
        RegistrationVerifier registrationVerifier =
            new RegistrationVerifier(dkimRegistry, keccak256(bytes(emailSender)));

        vm.stopBroadcast();

        console.log("Deployed DKIMRegistry at", address(dkimRegistry));
        console.log("Deployed RegistrationVerifier at", address(registrationVerifier));
    }
}
