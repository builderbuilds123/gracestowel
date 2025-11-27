#!/usr/bin/env node
/**
 * Standalone test script for Hyperdrive/PostgreSQL connection
 * Run with: node test-hyperdrive.mjs
 * 
 * This tests the same connection that Hyperdrive would use in production,
 * simulating what the Cloudflare Worker will do.
 */

import pg from 'pg';
import fs from 'fs';

const { Client } = pg;

// Read DATABASE_URL from .dev.vars
function getDatabaseUrl() {
    try {
        const devVars = fs.readFileSync('.dev.vars', 'utf-8');
        const match = devVars.match(/DATABASE_URL="([^"]+)"/);
        if (match) {
            return match[1];
        }
    } catch (e) {
        // Fall back to environment variable
    }
    return process.env.DATABASE_URL;
}

async function testConnection() {
    const connectionString = getDatabaseUrl();
    
    if (!connectionString) {
        console.error('❌ No DATABASE_URL found in .dev.vars or environment');
        process.exit(1);
    }

    console.log('🔗 Connection string:', connectionString.replace(/:[^:@]+@/, ':****@'));
    console.log('');
    
    const client = new Client({ connectionString });
    
    try {
        // Test 1: Basic connection
        console.log('📡 Test 1: Connecting to database...');
        const connectStart = Date.now();
        await client.connect();
        console.log(`   ✅ Connected in ${Date.now() - connectStart}ms`);
        console.log('');

        // Test 2: Simple query
        console.log('📡 Test 2: Running simple query...');
        const queryStart = Date.now();
        const result = await client.query('SELECT NOW() as time, current_database() as db, version() as version');
        console.log(`   ✅ Query completed in ${Date.now() - queryStart}ms`);
        console.log(`   📅 Server time: ${result.rows[0].time}`);
        console.log(`   🗄️  Database: ${result.rows[0].db}`);
        console.log(`   📦 PostgreSQL: ${result.rows[0].version.split(' ').slice(0, 2).join(' ')}`);
        console.log('');

        // Test 3: Check if product table exists
        console.log('📡 Test 3: Checking for Medusa product table...');
        const tableCheck = await client.query(`
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_name = 'product'
            ) as exists
        `);
        
        if (tableCheck.rows[0].exists) {
            console.log('   ✅ Product table found');
            
            // Count products
            const countResult = await client.query('SELECT COUNT(*) as count FROM product');
            console.log(`   📦 Total products: ${countResult.rows[0].count}`);
        } else {
            console.log('   ⚠️  Product table not found (Medusa may not be initialized)');
        }
        console.log('');

        // Test 4: Fetch sample products (if table exists)
        if (tableCheck.rows[0].exists) {
            console.log('📡 Test 4: Fetching sample products...');
            const productStart = Date.now();
            const products = await client.query(`
                SELECT id, handle, title, thumbnail
                FROM product
                LIMIT 5
            `);
            console.log(`   ✅ Fetched ${products.rows.length} products in ${Date.now() - productStart}ms`);
            
            if (products.rows.length > 0) {
                console.log('   📝 Sample products:');
                products.rows.forEach((p, i) => {
                    console.log(`      ${i + 1}. ${p.title} (${p.handle})`);
                });
            }
        }
        console.log('');

        // Test 5: Check product_variant table
        console.log('📡 Test 5: Checking product variants...');
        const variantCheck = await client.query(`
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_name = 'product_variant'
            ) as exists
        `);
        
        if (variantCheck.rows[0].exists) {
            const variantCount = await client.query('SELECT COUNT(*) as count FROM product_variant');
            console.log(`   ✅ Product variants table found`);
            console.log(`   📦 Total variants: ${variantCount.rows[0].count}`);
        }
        console.log('');

        console.log('✅ All tests passed! Hyperdrive connection is working.');
        console.log('');
        console.log('ℹ️  This local test simulates the Hyperdrive connection.');
        console.log('   In production, Cloudflare will use the Hyperdrive binding');
        console.log('   configured in wrangler.jsonc for edge acceleration.');
        
    } catch (error) {
        console.error('❌ Error:', error.message);
        if (error.code) {
            console.error('   Error code:', error.code);
        }
        process.exit(1);
    } finally {
        await client.end();
    }
}

testConnection();

