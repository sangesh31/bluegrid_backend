import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "dotenv/config";

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    // Local development network
    hardhat: {
      chainId: 1337,
    },
    
    // Polygon Mumbai Testnet (Free for testing)
    mumbai: {
      url: process.env.POLYGON_MUMBAI_RPC || "https://rpc-mumbai.maticvigil.com",
      accounts: process.env.BLOCKCHAIN_PRIVATE_KEY ? [process.env.BLOCKCHAIN_PRIVATE_KEY] : [],
      chainId: 80001,
      gasPrice: 20000000000, // 20 gwei
    },
    
    // Polygon Mainnet (Production)
    polygon: {
      url: process.env.POLYGON_RPC || "https://polygon-rpc.com",
      accounts: process.env.BLOCKCHAIN_PRIVATE_KEY ? [process.env.BLOCKCHAIN_PRIVATE_KEY] : [],
      chainId: 137,
      gasPrice: 50000000000, // 50 gwei
    },
    
    // Ethereum Sepolia Testnet
    sepolia: {
      url: process.env.SEPOLIA_RPC || "https://rpc.sepolia.org",
      accounts: process.env.BLOCKCHAIN_PRIVATE_KEY ? [process.env.BLOCKCHAIN_PRIVATE_KEY] : [],
      chainId: 11155111,
    },
  },
  etherscan: {
    // For contract verification
    apiKey: {
      polygon: process.env.POLYGONSCAN_API_KEY || "",
      polygonMumbai: process.env.POLYGONSCAN_API_KEY || "",
      sepolia: process.env.ETHERSCAN_API_KEY || "",
    },
  },
  paths: {
    sources: "./contracts",
    tests: "./test/blockchain",
    cache: "./cache",
    artifacts: "./artifacts",
  },
};

export default config;
