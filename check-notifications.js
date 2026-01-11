
const { Client } = require('pg');
require('dotenv').config({ path: 'apps/backend/.env' });

async function checkRecentNotifications() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_SSL !== "false" ? { rejectUnauthorized: false } : false
  });

  try {
    await client.connect();
    
    console.log('--- Recent Orders ---');
    const orderRes = await client.query(`
      SELECT id, display_id, email, created_at 
      FROM "order" 
      ORDER BY created_at DESC 
      LIMIT 1
    `);
    
    if (orderRes.rows.length === 0) {
      console.log('No orders found.');
    } else {
      const order = orderRes.rows[0];
      console.log(`Order ID: ${order.id}`);
      console.log(`Display ID: ${order.display_id}`);
      console.log(`Email: ${order.email}`);
      console.log(`Created: ${order.created_at}`);

      console.log('\n--- Recent Notifications ---');
      // Medusa v2 usually names tables with module prefixes or "notification"
      // I'll try to find the notification table.
      // It might be "notification" or "notification_notification"
      
      const tablesRes = await client.query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
          AND table_name LIKE '%notification%'
      `);
      
      const notificationTable = tablesRes.rows.find(r => r.table_name === 'notification')?.table_name || 'notification';
      
      if (notificationTable) {
        const notifRes = await client.query(`
          SELECT * FROM "${notificationTable}"
          WHERE data::text LIKE $1
          ORDER BY created_at DESC
          LIMIT 5
        `, [`%${order.id}%`]);
        
        if (notifRes.rows.length > 0) {
            notifRes.rows.forEach(n => {
                console.log(`Notification ID: ${n.id}`);
                console.log(`To: ${n.to}`);
                console.log(`Template: ${n.template}`);
                console.log(`Channel: ${n.channel}`);
                console.log(`Provider: ${n.provider_id}`);
                console.log(`Data (snippet): ${JSON.stringify(n.data).substring(0, 100)}...`);
                console.log(`Created: ${n.created_at}`);
                console.log('----------------');
            });
        } else {
            console.log('No notifications found containing this Order ID.');
        }
      } else {
          console.log('Could not determine notification table name.');
          console.log('Tables found:', tablesRes.rows.map(r => r.table_name));
      }
    }

  } catch (err) {
    console.error('Database Error:', err);
  } finally {
    await client.end();
  }
}

checkRecentNotifications();
