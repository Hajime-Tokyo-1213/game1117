/**
 * Inventory Management API
 * Handles product inventory CRUD operations with search and filtering
 */

import { authMiddleware } from '../utils/middleware.js';
import { query, getMany, getOne, insert, update as updateDb, count } from '../utils/database.js';

/**
 * Main API Handler
 */
export default authMiddleware(async function handler(req, res) {
  switch (req.method) {
    case 'GET':
      return await getInventory(req, res);
    case 'POST':
      return await addProduct(req, res);
    default:
      return res.status(405).json({ error: 'Method not allowed' });
  }
});

/**
 * Get inventory with filtering and pagination
 * GET /api/inventory
 */
async function getInventory(req, res) {
  try {
    const { 
      search, 
      category, 
      manufacturer, 
      condition_grade,
      page = 1, 
      limit = 50,
      sortBy = 'created_at',
      sortOrder = 'DESC'
    } = req.query;
    
    // Build base SQL query
    let sql = `
      SELECT id, name, category, model, manufacturer, condition_grade,
             purchase_price, selling_price, stock_quantity, zaico_item_id,
             created_at, updated_at
      FROM products
      WHERE 1=1
    `;
    
    const params = [];
    let paramCount = 0;
    
    // Apply search filter
    if (search) {
      paramCount++;
      sql += ` AND (name ILIKE $${paramCount} OR model ILIKE $${paramCount})`;
      params.push(`%${search}%`);
    }
    
    // Apply category filter
    if (category) {
      paramCount++;
      sql += ` AND category = $${paramCount}`;
      params.push(category);
    }
    
    // Apply manufacturer filter
    if (manufacturer) {
      paramCount++;
      sql += ` AND manufacturer = $${paramCount}`;
      params.push(manufacturer);
    }
    
    // Apply condition grade filter
    if (condition_grade) {
      paramCount++;
      sql += ` AND condition_grade = $${paramCount}`;
      params.push(condition_grade);
    }
    
    // Apply sorting
    const validSortColumns = ['name', 'created_at', 'selling_price', 'stock_quantity', 'manufacturer'];
    const validSortOrders = ['ASC', 'DESC'];
    
    if (validSortColumns.includes(sortBy) && validSortOrders.includes(sortOrder.toUpperCase())) {
      sql += ` ORDER BY ${sortBy} ${sortOrder.toUpperCase()}`;
    } else {
      sql += ` ORDER BY created_at DESC`;
    }
    
    // Apply pagination
    const offset = (page - 1) * limit;
    sql += ` LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`;
    params.push(limit, offset);
    
    // Execute query
    const { rows } = await query(sql, params);
    
    // Get total count for pagination
    let countSql = 'SELECT COUNT(*) FROM products WHERE 1=1';
    const countParams = [];
    let countParamCount = 0;
    
    // Apply same filters to count query
    if (search) {
      countParamCount++;
      countSql += ` AND (name ILIKE $${countParamCount} OR model ILIKE $${countParamCount})`;
      countParams.push(`%${search}%`);
    }
    
    if (category) {
      countParamCount++;
      countSql += ` AND category = $${countParamCount}`;
      countParams.push(category);
    }
    
    if (manufacturer) {
      countParamCount++;
      countSql += ` AND manufacturer = $${countParamCount}`;
      countParams.push(manufacturer);
    }
    
    if (condition_grade) {
      countParamCount++;
      countSql += ` AND condition_grade = $${countParamCount}`;
      countParams.push(condition_grade);
    }
    
    const { rows: countRows } = await query(countSql, countParams);
    const total = parseInt(countRows[0].count);
    
    res.json({
      products: rows,
      total: total,
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: Math.ceil(total / limit),
      hasNextPage: page * limit < total,
      hasPrevPage: page > 1
    });
    
  } catch (error) {
    console.error('Get inventory error:', error);
    res.status(500).json({ 
      error: 'サーバーエラーが発生しました',
      message: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}

/**
 * Add new product to inventory
 * POST /api/inventory
 */
async function addProduct(req, res) {
  try {
    // Check permissions (staff or above)
    if (!['staff', 'admin', 'super_admin'].includes(req.user.role)) {
      return res.status(403).json({ error: '権限がありません' });
    }
    
    const {
      name, 
      category, 
      model, 
      manufacturer, 
      condition_grade,
      purchase_price, 
      selling_price, 
      stock_quantity, 
      zaico_item_id, 
      zaico_data,
      description,
      barcode,
      location
    } = req.body;
    
    // Validate required fields
    if (!name || !category) {
      return res.status(400).json({ 
        error: '商品名とカテゴリは必須です',
        details: {
          name: !name ? '商品名は必須です' : null,
          category: !category ? 'カテゴリは必須です' : null
        }
      });
    }
    
    // Check for duplicate zaico_item_id if provided
    if (zaico_item_id) {
      const existingProduct = await getOne(
        'SELECT id FROM products WHERE zaico_item_id = $1',
        [zaico_item_id]
      );
      
      if (existingProduct) {
        return res.status(409).json({ 
          error: '指定されたZaico商品IDは既に存在します',
          conflictingId: existingProduct.id
        });
      }
    }
    
    // Prepare product data
    const productData = {
      name,
      category,
      model: model || null,
      manufacturer: manufacturer || null,
      condition_grade: condition_grade || 'B',
      purchase_price: purchase_price || 0,
      selling_price: selling_price || 0,
      stock_quantity: stock_quantity || 0,
      zaico_item_id: zaico_item_id || null,
      zaico_data: zaico_data ? JSON.stringify(zaico_data) : null,
      description: description || null,
      barcode: barcode || null,
      location: location || null,
      created_by: req.user.id,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    
    // Insert product
    const newProduct = await insert('products', productData);
    
    res.status(201).json({ 
      product: newProduct,
      message: '商品が正常に追加されました'
    });
    
  } catch (error) {
    console.error('Add product error:', error);
    
    // Handle specific database errors
    if (error.code === '23505') { // Unique violation
      return res.status(409).json({ 
        error: '重複する商品データが存在します',
        details: error.detail
      });
    }
    
    res.status(500).json({ 
      error: 'サーバーエラーが発生しました',
      message: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}