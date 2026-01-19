const fs = require('fs');
const path = require('path');

const files = [
  'postman/collections/store-api.postman_collection.json',
  'postman/collections/admin-api.postman_collection.json'
];

function cleanItem(item) {
  if (item.item) {
    item.item.forEach(cleanItem);
  }
  
  if (item.request) {
    // 1. Disable query parameters with placeholder values
    if (item.request.url && item.request.url.query) {
      item.request.url.query.forEach(param => {
        const val = String(param.value || "");
        if (val.includes('<string>') || 
            val.includes('<number>') || 
            val.includes('<boolean>') || 
            val.includes('<integer>') ||
            val.includes('<object>') ||
            val === 'string' ||
            val === 'number' ||
            val === 'boolean' ||
            val.includes('[object Object]')) {
          param.disabled = true;
        }
      });
    }

    // 2. Disable headers with placeholder values (except Accept/Content-Type)
    // AND map x-publishable-api-key to variable
    if (item.request.header) {
      item.request.header.forEach(header => {
         const val = String(header.value || "");
         if (header.key === 'x-publishable-api-key') {
             header.value = '{{publishable_api_key}}';
             header.disabled = false;
         } else if (val.includes('<string>') || val.includes('<API Key>')) {
           // Keep Accept/Content-Type but disabling others
           if (header.key.toLowerCase() !== 'accept' && header.key.toLowerCase() !== 'content-type') {
             header.disabled = true;
           }
         }
      });
    }

    // 3. For path variables, we can't easily guess valid IDs, but we can try to leave them as is
    // so the user can fill them in postman.
    // However, for the 'List' endpoints, they usually don't have path variables.
    
    // 4. Reset path variable defaults to empty if they are garbage, 
    // but Postman uses the collection variable if it exists.
    if (item.request.url && item.request.url.variable) {
       item.request.url.variable.forEach(v => {
         if (v.value === '<string>') v.value = '';
       });
    }
  }
}

files.forEach(file => {
  const filePath = path.resolve(process.cwd(), file);
  if (fs.existsSync(filePath)) {
    console.log(`Cleaning ${file}...`);
    const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    
    if (content.item) {
      content.item.forEach(cleanItem);
    }
    
    fs.writeFileSync(filePath, JSON.stringify(content, null, 2));
    console.log(`Done.`);
  } else {
    console.error(`File not found: ${file}`);
  }
});
