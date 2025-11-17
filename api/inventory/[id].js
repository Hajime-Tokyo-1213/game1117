/**
 * Individual Product Operations API
 * Handles CRUD operations for specific inventory items
 */

import { authMiddleware } from '../utils/middleware.js';
import { getOne, update as updateDb, remove, query } from '../utils/database.js';

/**
 * Main API Handler
 */
export default authMiddleware(async function handler(req, res) {
  const { id } = req.query;
  
  if (!id) {
    return res.status(400).json({ error: '商品IDが必要です' });
  }
  
  switch (req.method) {
    case 'GET':
      return await getProduct(req, res, id);
    case 'PUT':
      return await updateProduct(req, res, id);
    case 'DELETE':
      return await deleteProduct(req, res, id);
    default:
      return res.status(405).json({ error: 'Method not allowed' });
  }
});

/**
 * Get individual product
 * GET /api/inventory/[id]
 */
async function getProduct(req, res, id) {
  try {
    const product = await getOne(`
      SELECT 
        id, name, category, model, manufacturer, condition_grade,
        purchase_price, selling_price, stock_quantity, zaico_item_id,
        zaico_data, description, barcode, location,
        created_by, created_at, updated_at
      FROM products 
      WHERE id = $1
    `, [id]);
    
    if (!product) {
      return res.status(404).json({ 
        error: '商品が見つかりません',
        productId: id
      });
    }
    
    // Parse zaico_data if it exists
    if (product.zaico_data) {
      try {
        product.zaico_data = JSON.parse(product.zaico_data);
      } catch (parseError) {
        console.warn('Failed to parse zaico_data:', parseError);
        product.zaico_data = null;
      }
    }
    
    res.json({ product });
    
  } catch (error) {
    console.error('Get product error:', error);
    res.status(500).json({ 
      error: 'サーバーエラーが発生しました',
      message: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}

/**
 * Update product
 * PUT /api/inventory/[id]
 */
async function updateProduct(req, res, id) {
  try {
    // Check permissions (staff or above)
    if (!['staff', 'admin', 'super_admin'].includes(req.user.role)) {
      return res.status(403).json({ error: '権限がありません' });
    }
    
    // Check if product exists
    const existingProduct = await getOne(
      'SELECT id FROM products WHERE id = $1',
      [id]
    );
    
    if (!existingProduct) {
      return res.status(404).json({ 
        error: '商品が見つかりません',
        productId: id
      });
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
    
    // Validate required fields if provided
    if (name !== undefined && !name.trim()) {
      return res.status(400).json({ error: '商品名は必須です' });
    }
    
    if (category !== undefined && !category.trim()) {
      return res.status(400).json({ error: 'カテゴリは必須です' });
    }
    
    // Check for duplicate zaico_item_id if provided and different from current
    if (zaico_item_id) {
      const duplicateProduct = await getOne(
        'SELECT id FROM products WHERE zaico_item_id = $1 AND id != $2',
        [zaico_item_id, id]
      );
      
      if (duplicateProduct) {
        return res.status(409).json({ 
          error: '指定されたZaico商品IDは既に存在します',
          conflictingId: duplicateProduct.id
        });
      }
    }
    
    // Prepare update data (only include provided fields)
    const updateData = {};
    
    if (name !== undefined) updateData.name = name;
    if (category !== undefined) updateData.category = category;
    if (model !== undefined) updateData.model = model;
    if (manufacturer !== undefined) updateData.manufacturer = manufacturer;
    if (condition_grade !== undefined) updateData.condition_grade = condition_grade;
    if (purchase_price !== undefined) updateData.purchase_price = purchase_price;
    if (selling_price !== undefined) updateData.selling_price = selling_price;
    if (stock_quantity !== undefined) updateData.stock_quantity = stock_quantity;
    if (zaico_item_id !== undefined) updateData.zaico_item_id = zaico_item_id;
    if (zaico_data !== undefined) updateData.zaico_data = zaico_data ? JSON.stringify(zaico_data) : null;
    if (description !== undefined) updateData.description = description;
    if (barcode !== undefined) updateData.barcode = barcode;
    if (location !== undefined) updateData.location = location;
    
    // Always update these fields
    updateData.updated_at = new Date().toISOString();
    updateData.updated_by = req.user.id;
    
    if (Object.keys(updateData).length === 2) { // Only updated_at and updated_by
      return res.status(400).json({ error: '更新するデータが指定されていません' });
    }
    
    // Perform update
    const [updatedProduct] = await updateDb('products', updateData, 'id = $1', [id]);
    
    if (!updatedProduct) {
      return res.status(404).json({ 
        error: '商品が見つかりません',
        productId: id
      });
    }
    
    // Parse zaico_data for response
    if (updatedProduct.zaico_data) {
      try {
        updatedProduct.zaico_data = JSON.parse(updatedProduct.zaico_data);
      } catch (parseError) {
        console.warn('Failed to parse zaico_data:', parseError);
        updatedProduct.zaico_data = null;
      }
    }
    
    res.json({ 
      product: updatedProduct,
      message: '商品が正常に更新されました'
    });
    
  } catch (error) {
    console.error('Update product error:', error);
    
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

/**
 * Delete product (soft delete)
 * DELETE /api/inventory/[id]
 */
async function deleteProduct(req, res, id) {
  try {
    // Check permissions (admin only)
    if (!['admin', 'super_admin'].includes(req.user.role)) {
      return res.status(403).json({ error: '管理者権限が必要です' });
    }
    
    // Check if product exists
    const existingProduct = await getOne(
      'SELECT id, name FROM products WHERE id = $1',
      [id]
    );
    
    if (!existingProduct) {
      return res.status(404).json({ 
        error: '商品が見つかりません',
        productId: id
      });
    }
    
    // Perform soft delete (update status instead of actual deletion)
    const [deletedProduct] = await updateDb(
      'products', 
      {
        status: 'deleted',
        deleted_at: new Date().toISOString(),
        deleted_by: req.user.id,
        updated_at: new Date().toISOString()
      },
      'id = $1',
      [id]
    );
    
    if (!deletedProduct) {
      return res.status(500).json({ error: '商品の削除に失敗しました' });
    }
    
    res.json({ 
      message: '商品が正常に削除されました',
      deletedProduct: {
        id: deletedProduct.id,
        name: deletedProduct.name
      }
    });
    
  } catch (error) {
    console.error('Delete product error:', error);
    res.status(500).json({ 
      error: 'サーバーエラーが発生しました',
      message: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}