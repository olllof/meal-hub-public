const PicnicClient = require("picnic-api");

async function test() {
  // Try with different configurations
  const configs = [
    { name: "Default", countryCode: "NL" },
    { name: "With custom device ID", countryCode: "NL", deviceId: "test-device" },
    { name: "With custom agent", countryCode: "NL", agent: "30100;1.228.1-15480;" }
  ];
  
  for (const config of configs) {
    console.log(`\nTesting: ${config.name}`);
    console.log(`Config:`, JSON.stringify(config));
    
    try {
      const client = new PicnicClient(config);
      const response = await client.auth.login("olle.ekman@gmail.com", "Norrkoping1987!");
      console.log("✅ Success!");
      console.log("2FA required:", response.second_factor_authentication_required);
      return; // Stop if one works
    } catch (error) {
      console.log("❌", error.message);
    }
  }
}

test();
