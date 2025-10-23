import { ethers } from "hardhat";

async function main() {
  console.log("🚀 Starting BlueGrid Smart Contract Deployment...\n");

  // Get deployer account
  const [deployer] = await ethers.getSigners();
  console.log("📝 Deploying contracts with account:", deployer.address);
  
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("💰 Account balance:", ethers.formatEther(balance), "ETH\n");

  // Deploy MaintenanceReportRegistry
  console.log("📄 Deploying MaintenanceReportRegistry...");
  const MaintenanceReportRegistry = await ethers.getContractFactory("MaintenanceReportRegistry");
  const reportRegistry = await MaintenanceReportRegistry.deploy();
  await reportRegistry.waitForDeployment();
  const reportRegistryAddress = await reportRegistry.getAddress();
  
  console.log("✅ MaintenanceReportRegistry deployed to:", reportRegistryAddress);

  // Wait for a few block confirmations
  console.log("\n⏳ Waiting for block confirmations...");
  await reportRegistry.deploymentTransaction()?.wait(5);

  console.log("\n🎉 Deployment Complete!");
  console.log("\n📋 Contract Addresses:");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("MaintenanceReportRegistry:", reportRegistryAddress);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  console.log("\n📝 Next Steps:");
  console.log("1. Update your .env file with the contract address:");
  console.log(`   REPORT_REGISTRY_ADDRESS=${reportRegistryAddress}`);
  console.log("\n2. Verify the contract on block explorer:");
  console.log(`   npx hardhat verify --network <network> ${reportRegistryAddress}`);
  console.log("\n3. Grant operator roles to your backend service:");
  console.log("   Use the grantOperatorRole function with your backend wallet address");

  // Save deployment info
  const fs = require('fs');
  const deploymentInfo = {
    network: (await ethers.provider.getNetwork()).name,
    chainId: (await ethers.provider.getNetwork()).chainId,
    deployer: deployer.address,
    timestamp: new Date().toISOString(),
    contracts: {
      MaintenanceReportRegistry: reportRegistryAddress,
    }
  };

  fs.writeFileSync(
    'deployment-info.json',
    JSON.stringify(deploymentInfo, null, 2)
  );
  console.log("\n💾 Deployment info saved to deployment-info.json");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Deployment failed:", error);
    process.exit(1);
  });
