const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Configuration - Replace with your actual values
const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const ORDERS_TABLE_ID = process.env.ORDERS_TABLE_ID;
const LINE_ITEMS_TABLE_ID = process.env.LINE_ITEMS_TABLE_ID;

// Health check endpoint
app.get('/', (req, res) => {
  res.json({ 
    status: 'Webhook server is running!',
    timestamp: new Date().toISOString()
  });
});

// Main webhook endpoint
app.post('/webhook/shopify/orders', async (req, res) => {
  try {
    console.log('Received webhook:', req.body.order_number);
    
    const order = req.body;
    await processShopifyOrder(order);
    
    res.status(200).json({ 
      success: true, 
      message: `Order ${order.order_number} processed successfully` 
    });
  } catch (error) {
    console.error('Error processing webhook:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Main function to process Shopify order
async function processShopifyOrder(order) {
  console.log(`Processing order: ${order.order_number}`);
  
  // Step 1: Create order record in Airtable
  const orderRecord = await createOrderRecord(order);
  
  // Step 2: Create line item records for each product in the order
  for (let i = 0; i < order.line_items.length; i++) {
    const lineItem = order.line_items[i];
    await createLineItemRecord(lineItem, orderRecord.id, order.order_number, i + 1);
  }
}

// Create order record in Airtable
async function createOrderRecord(order) {
  const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${ORDERS_TABLE_ID}`;
  
  const billingAddress = order.billing_address || {};
  
  const payload = {
    fields: {
      'Order ID': order.order_number?.toString() || order.id?.toString(),
      'Billing Name': `${billingAddress.first_name || ''} ${billingAddress.last_name || ''}`.trim(),
      'Phone': billingAddress.phone || order.phone || '',
      'Email': order.email || '',
      'Total Price': parseFloat(order.total_price || 0),
      'Currency': order.currency || 'USD',
      'Order Date': order.created_at,
      'Financial Status': order.financial_status || '',
      'Fulfillment Status': order.fulfillment_status || 'unfulfilled',
      'Tags': order.tags || '',
      'Customer ID': order.customer?.id?.toString() || '',
      'Shipping Address': formatAddress(order.shipping_address),
      'Billing Address': formatAddress(billingAddress)
    }
  };
  
  // Remove empty fields
  Object.keys(payload.fields).forEach(key => {
    if (payload.fields[key] === '' || payload.fields[key] === null || payload.fields[key] === undefined) {
      delete payload.fields[key];
    }
  });
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${AIRTABLE_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Failed to create order: ${JSON.stringify(error)}`);
  }
  
  const result = await response.json();
  console.log(`Created order record: ${result.id}`);
  return result;
}

// Create line item record in Airtable
async function createLineItemRecord(lineItem, orderRecordId, orderNumber, lineItemIndex) {
  const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${LINE_ITEMS_TABLE_ID}`;
  
  const lineItemId = `${orderNumber}-${lineItemIndex}`;
  
  const payload = {
    fields: {
      'Line Item ID': lineItemId,
      'Order ID': [orderRecordId],
      'Item Name': lineItem.name,
      'Line Item Quantity': lineItem.quantity,
      'Line Item Price': parseFloat(lineItem.price),
      'Total Line Price': parseFloat(lineItem.price) * lineItem.quantity,
      'SKU': lineItem.sku || '',
      'Product ID': lineItem.product_id?.toString() || '',
      'Variant ID': lineItem.variant_id?.toString() || '',
      'Vendor': lineItem.vendor || '',
      'Product Type': lineItem.product_type || '',
      'Requires Shipping': lineItem.requires_shipping || false,
      'Taxable': lineItem.taxable || false,
      'Gift Card': lineItem.gift_card || false
    }
  };
  
  // Remove empty fields
  Object.keys(payload.fields).forEach(key => {
    if (payload.fields[key] === '' || payload.fields[key] === null || payload.fields[key] === undefined) {
      delete payload.fields[key];
    }
  });
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${AIRTABLE_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Failed to create line item: ${JSON.stringify(error)}`);
  }
  
  const result = await response.json();
  console.log(`Created line item record: ${result.id} for order ${orderNumber}`);
  return result;
}

// Helper function to format address
function formatAddress(address) {
  if (!address) return '';
  
  const parts = [
    address.address1,
    address.address2,
    address.city,
    address.province,
    address.zip,
    address.country
  ].filter(Boolean);
  
  return parts.join(', ');
}

app.listen(PORT, () => {
  console.log(`🚀 Webhook server running on port ${PORT}`);
  console.log(`📡 Webhook URL will be: https://your-app-name.up.railway.app/webhook/shopify/orders`);
});