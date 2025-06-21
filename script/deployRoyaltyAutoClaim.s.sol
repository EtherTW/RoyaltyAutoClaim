// SPDX-License-Identifier: MIT
pragma solidity ^0.8.13;

import {Script, console} from "forge-std/Script.sol";
import {RoyaltyAutoClaim} from "../src/RoyaltyAutoClaim.sol";
import {RoyaltyAutoClaimProxy} from "../src/RoyaltyAutoClaimProxy.sol";

/*
    forge script script/deployRoyaltyAutoClaim.s.sol --rpc-url $NETWORK --broadcast --verify
*/

contract DeployRoyaltyAutoClaimScript is Script {
    function run() public {
        address deployer = vm.rememberKey(vm.envUint("PRIVATE_KEY"));
        console.log("Deployer", deployer);

        address owner = 0xeDc1c67E682DD9beF39b233D0a4b909E35156909;
        address admin = 0xeDc1c67E682DD9beF39b233D0a4b909E35156909;
        address token = 0x6B175474E89094C44Da98b954EedeAC495271d0F; // DAI

        address[] memory reviewers = new address[](1);
        reviewers[0] = 0xeDc1c67E682DD9beF39b233D0a4b909E35156909;

        vm.startBroadcast(deployer);

        RoyaltyAutoClaim royaltyAutoClaim = new RoyaltyAutoClaim();
        RoyaltyAutoClaimProxy proxy = new RoyaltyAutoClaimProxy(
            address(royaltyAutoClaim), abi.encodeCall(RoyaltyAutoClaim.initialize, (owner, admin, token, reviewers))
        );

        console.log("RoyaltyAutoClaim implementation at:", address(royaltyAutoClaim));
        console.log("RoyaltyAutoClaim proxy at:", address(proxy));

        vm.stopBroadcast();
    }
}
