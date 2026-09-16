const PicnicClient = require("picnic-api");

async function test() {
  try {
    const client = new PicnicClient({ countryCode: "NL" });
    console.log("Testing with credentials:");
    console.log("  Email: olle.ekman@gmail.com");
    console.log("  Password: Norrkoping1987!");
    console.log("");
    
    const response = await client.auth.login("olle.ekman@gmail.com", "Norrkoping1987!");
    console.log("✅ Login successful!");
    console.log("Response:", JSON.stringify(response, null, 2));
  } catch (error) {
    console.error("❌ Login failed!");
    console.error("Error:", error.message);
  }
}

test();
