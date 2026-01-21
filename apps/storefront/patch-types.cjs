
const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'worker-configuration.d.ts');

try {
  let content = fs.readFileSync(filePath, 'utf8');
  
  // Replace the restrictive StringifyValues with a looser Record type to allow test overrides
  const newContent = content.replace(
    /extends StringifyValues<(.*)>/,
    'extends Record<keyof $1, string>'
  );

  if (content !== newContent) {
    fs.writeFileSync(filePath, newContent);
    console.log('✅ Successfully patched ProcessEnv type in worker-configuration.d.ts');
  } else {
    // Check if it's already patched to avoid false negatives if run multiple times
    if (content.includes('extends Record<keyof')) {
        console.log('ℹ️  File already patched with Record type.');
    } else {
        console.log('⚠️ Pattern not found.');
    }
  }

} catch (err) {
  console.error('❌ Error patching worker-configuration.d.ts:', err);
  process.exit(1);
}
