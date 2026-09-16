const PicnicClient = require("picnic-api");

async function test() {
  console.log("Testing login with verified credentials...");
  console.log("Email: olle.ekman@gmail.com");
  console.log("Password: Norrkoping1987!");
  console.log("");
  
  try {
    const client = new PicnicClient({ countryCode: "NL" });
    const response = await client.auth.login("olle.ekman@gmail.com", "Norrkoping1987!");
    
    if (response.second_factor_authentication_required) {
      console.log("✅ SUCCESS! 2FA is required");
      console.log("This means the library accepted the credentials!");
    } else {
      console.log("✅ Login successful, no 2FA needed");
    }
  } catch (error) {
    console.error("❌ Library still rejecting credentials");
    console.error("Error:", error.message);
    
    // Try to get more details
    if (error.response) {
      console.error("Response status:", error.response.status);
      console.error("Response data:", error.response.data);
    }
  }
}

test();
