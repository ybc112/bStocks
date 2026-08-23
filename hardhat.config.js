require("@nomicfoundation/hardhat-ethers");

module.exports = {
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      },
      viaIR: true
    }
  },
  networks: {
    bscTestnet: {
      url: "https://data-seed-prebsc-1-s1.binance.org:8545",
      chainId: 97
    },
    bsc: {
      url: "https://bsc-dataseed.binance.org",
      chainId: 56
    }
  },
  etherscan: {
    apiKey: {
      bscTestnet: process.env.BSCSCAN_TESTNET_API_KEY || "",
      bsc: process.env.BSCSCAN_API_KEY || ""
    }
  }
};