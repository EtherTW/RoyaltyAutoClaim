"use strict";
var _a, _b, _c, _d;
Object.defineProperty(exports, "__esModule", { value: true });
exports.SEMAPHORE_IDENTITY_MESSAGE = exports.GITHUB_REPO_NAME = exports.ERROR_NOTIFICATION_DURATION = exports.BUNDLER_URL = exports.EXPLORER_URL = exports.TENDERLY_RPC_URL = exports.RPC_URL = exports.DEFAULT_CHAIN_ID = exports.CHAIN_ID = exports.ALCHEMY_API_KEY = exports.ROYALTY_AUTO_CLAIM_PROXY_ADDRESS_BASE = exports.ROYALTY_AUTO_CLAIM_PROXY_ADDRESS_BASE_SEPOLIA = exports.ROYALTY_AUTO_CLAIM_PROXY_ADDRESS_MAINNET = exports.ROYALTY_AUTO_CLAIM_PROXY_ADDRESS_SEPOLIA = exports.ROYALTY_AUTO_CLAIM_PROXY_ADDRESS_LOCAL = exports.IS_DEV = void 0;
// built-in constants: https://vite.dev/guide/env-and-mode#built-in-constants
exports.IS_DEV = !import.meta.env.PROD;
// Main Contract Address
exports.ROYALTY_AUTO_CLAIM_PROXY_ADDRESS_LOCAL = '0xa818cA7A4869c7C7101d0Ea5E4c455Ef00e698d5';
exports.ROYALTY_AUTO_CLAIM_PROXY_ADDRESS_SEPOLIA = import.meta.env
    .VITE_ROYALTY_AUTO_CLAIM_PROXY_ADDRESS_SEPOLIA;
exports.ROYALTY_AUTO_CLAIM_PROXY_ADDRESS_MAINNET = import.meta.env
    .VITE_ROYALTY_AUTO_CLAIM_PROXY_ADDRESS_MAINNET;
exports.ROYALTY_AUTO_CLAIM_PROXY_ADDRESS_BASE_SEPOLIA = import.meta.env
    .VITE_ROYALTY_AUTO_CLAIM_PROXY_ADDRESS_BASE_SEPOLIA;
exports.ROYALTY_AUTO_CLAIM_PROXY_ADDRESS_BASE = import.meta.env
    .VITE_ROYALTY_AUTO_CLAIM_PROXY_ADDRESS_BASE;
exports.ALCHEMY_API_KEY = import.meta.env.VITE_ALCHEMY_API_KEY;
if (!exports.ALCHEMY_API_KEY) {
    throw new Error('ALCHEMY_API_KEY is not set in .env');
}
var CHAIN_ID;
(function (CHAIN_ID) {
    CHAIN_ID["LOCAL"] = "1337";
    CHAIN_ID["SEPOLIA"] = "11155111";
    CHAIN_ID["MAINNET"] = "1";
    CHAIN_ID["BASE_SEPOLIA"] = "84532";
    CHAIN_ID["BASE"] = "8453";
})(CHAIN_ID || (exports.CHAIN_ID = CHAIN_ID = {}));
exports.DEFAULT_CHAIN_ID = exports.IS_DEV ? CHAIN_ID.BASE_SEPOLIA : CHAIN_ID.MAINNET;
exports.RPC_URL = (_a = {},
    _a[CHAIN_ID.LOCAL] = "http://localhost:8545",
    _a[CHAIN_ID.SEPOLIA] = "https://eth-sepolia.g.alchemy.com/v2/".concat(exports.ALCHEMY_API_KEY),
    _a[CHAIN_ID.MAINNET] = "https://eth-mainnet.g.alchemy.com/v2/".concat(exports.ALCHEMY_API_KEY),
    _a[CHAIN_ID.BASE_SEPOLIA] = "https://base-sepolia.g.alchemy.com/v2/".concat(exports.ALCHEMY_API_KEY),
    _a[CHAIN_ID.BASE] = "https://base-mainnet.g.alchemy.com/v2/".concat(exports.ALCHEMY_API_KEY),
    _a);
exports.TENDERLY_RPC_URL = (_b = {},
    _b[CHAIN_ID.LOCAL] = "http://localhost:8545",
    _b[CHAIN_ID.SEPOLIA] = "https://sepolia.gateway.tenderly.co/5j2Bli4kdZh94hJp4Mg7x1",
    _b[CHAIN_ID.MAINNET] = "https://mainnet.gateway.tenderly.co/7SOJjmp7ir0NXhDU1IL29v",
    _b[CHAIN_ID.BASE_SEPOLIA] = 'https://base-sepolia.gateway.tenderly.co/7VvN7z5fn1xVirOQsSzKD',
    _b[CHAIN_ID.BASE] = 'https://base.gateway.tenderly.co/7ku6af38xSIhnCo7IAEBQ6',
    _b);
exports.EXPLORER_URL = (_c = {},
    _c[CHAIN_ID.LOCAL] = 'http://localhost:3000',
    _c[CHAIN_ID.SEPOLIA] = 'https://sepolia.etherscan.io',
    _c[CHAIN_ID.MAINNET] = 'https://etherscan.io',
    _c[CHAIN_ID.BASE_SEPOLIA] = 'https://sepolia.basescan.org',
    _c[CHAIN_ID.BASE] = 'https://basescan.org',
    _c);
exports.BUNDLER_URL = (_d = {},
    _d[CHAIN_ID.LOCAL] = 'http://localhost:4337',
    _d[CHAIN_ID.SEPOLIA] = "https://eth-sepolia.g.alchemy.com/v2/".concat(exports.ALCHEMY_API_KEY),
    _d[CHAIN_ID.MAINNET] = "https://eth-mainnet.g.alchemy.com/v2/".concat(exports.ALCHEMY_API_KEY),
    _d[CHAIN_ID.BASE_SEPOLIA] = 'https://api.pimlico.io/v2/84532/rpc?apikey=pim_nDodV8Xhz7bXSEoeL9UbGh',
    _d[CHAIN_ID.BASE] = 'https://api.pimlico.io/v2/8453/rpc?apikey=pim_nDodV8Xhz7bXSEoeL9UbGh',
    _d);
// Duration of error notification in ms, -1 means it will not disappear automatically
exports.ERROR_NOTIFICATION_DURATION = -1;
exports.GITHUB_REPO_NAME = 'RoyaltyAutoClaim';
exports.SEMAPHORE_IDENTITY_MESSAGE = 'Sign this message to generate your Semaphore identity for https://ethertw.github.io/RoyaltyAutoClaim\n\nThis signature creates a deterministic private key for anonymous proof generation.\n\nIMPORTANT: Never sign this exact message on other websites, as doing so would allow them to generate the same identity and compromise your privacy across platforms.';
