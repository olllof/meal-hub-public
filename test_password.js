const PicnicClient = require("picnic-api");

async function test() {
  const passwords = [
    "Norrkoping1987!",
    "Norrkoping1987! ",  // with trailing space
    " Norrkoping1987!",  // with leading space
  ];
  
  for (const pwd of passwords) {
    console.log(`Testing password: "${pwd}" (length: ${pwd.length})`);
    
    try {
      const client = new PicnicClient({ countryCode: "NL" });
      const response = await client.auth.login("olle.ekman@gmail.com", pwd);
      console.log("✅ Success!");
      return;
    } catch (error) {
      console.log("❌", error.message);
    }
  }
}

test();
