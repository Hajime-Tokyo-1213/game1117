const LEDGER_STORAGE_KEY = 'ledgerRecords';

const safeParseJSON = (value, fallback) => {
  try {
    return JSON.parse(value ?? '') ?? fallback;
  } catch (error) {
    console.error('ledgerRecords JSON parse error:', error);
    return fallback;
  }
};

export const loadLedgerRecords = () => {
  return safeParseJSON(localStorage.getItem(LEDGER_STORAGE_KEY), []);
};

export const saveLedgerRecords = (records) => {
  localStorage.setItem(LEDGER_STORAGE_KEY, JSON.stringify(records));
};

const mergeUnique = (original = [], incoming = []) => {
  const set = new Set(original);
  incoming.forEach(value => {
    if (value !== undefined && value !== null && value !== '') {
      set.add(value);
    }
  });
  return Array.from(set);
};

const asNumber = (value, fallback = 0) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
};

const normalizeInventorySnapshot = (inventoryItem = {}) => {
  return {
    inventoryId: inventoryItem.id,
    productType: inventoryItem.productType,
    title: inventoryItem.title || inventoryItem.consoleLabel || inventoryItem.softwareName || 'ゲーム商品',
    manufacturer: inventoryItem.manufacturer || '',
    manufacturerLabel: inventoryItem.manufacturerLabel || '',
    console: inventoryItem.console || '',
    consoleLabel: inventoryItem.consoleLabel || '',
    color: inventoryItem.color || '',
    colorLabel: inventoryItem.colorLabel || '',
    softwareName: inventoryItem.softwareName || '',
    assessedRank: inventoryItem.assessedRank || '',
    accessories: inventoryItem.accessories || '',
    accessoriesLabel: inventoryItem.accessoriesLabel || '',
    sourceType: inventoryItem.sourceType || '',
    customer: inventoryItem.customer || null,
    supplier: inventoryItem.supplier || null,
    applicationNumber: inventoryItem.applicationNumber || '',
    zaicoId: inventoryItem.zaicoId || null
  };
};

const createLedgerBaseRecord = (inventoryItem) => {
  const snapshot = normalizeInventorySnapshot(inventoryItem);
  const now = new Date().toISOString();

  return {
    id: snapshot.inventoryId,
    inventoryId: snapshot.inventoryId,
    managementNumbers: Array.isArray(inventoryItem?.managementNumbers) ? inventoryItem.managementNumbers : [],
    product: snapshot,
    purchase: {
      totalQuantity: 0,
      totalCostJPY: 0,
      averageUnitCostJPY: 0,
      events: []
    },
    sale: {
      totalQuantity: 0,
      totalRevenueJPY: 0,
      totalRevenueUSD: 0,
      totalShippingJPY: 0,
      totalShippingUSD: 0,
      events: []
    },
    status: 'in_stock',
    createdAt: now,
    updatedAt: now,
    notes: []
  };
};

const updatePurchaseSummary = (record) => {
  const totalQuantity = record.purchase.events.reduce((sum, event) => sum + event.quantity, 0);
  const totalCost = record.purchase.events.reduce((sum, event) => sum + event.totalCostJPY, 0);

  record.purchase.totalQuantity = totalQuantity;
  record.purchase.totalCostJPY = totalCost;
  record.purchase.averageUnitCostJPY = totalQuantity > 0 ? Math.round((totalCost / totalQuantity) * 100) / 100 : 0;
};

const updateSaleSummary = (record) => {
  const totals = record.sale.events.reduce(
    (acc, event) => {
      acc.quantity += event.quantity;
      acc.revenueJPY += event.totalPriceJPY;
      acc.revenueUSD += event.totalPriceUSD;
      acc.shippingJPY += event.shippingFeeJPY;
      acc.shippingUSD += event.shippingFeeUSD;
      return acc;
    },
    { quantity: 0, revenueJPY: 0, revenueUSD: 0, shippingJPY: 0, shippingUSD: 0 }
  );

  record.sale.totalQuantity = totals.quantity;
  record.sale.totalRevenueJPY = totals.revenueJPY;
  record.sale.totalRevenueUSD = totals.revenueUSD;
  record.sale.totalShippingJPY = totals.shippingJPY;
  record.sale.totalShippingUSD = totals.shippingUSD;
};

const updateLedgerStatus = (record) => {
  if (record.sale.totalQuantity === 0) {
    record.status = 'in_stock';
    return;
  }

  if (record.sale.totalQuantity >= record.purchase.totalQuantity) {
    record.status = 'sold';
    return;
  }

  record.status = 'partial';
};

const upsertRecord = (inventoryItem) => {
  const records = loadLedgerRecords();
  const recordIndex = records.findIndex(record => record.inventoryId === inventoryItem.id);

  if (recordIndex === -1) {
    const newRecord = createLedgerBaseRecord(inventoryItem);
    records.push(newRecord);
    return { records, record: newRecord };
  }

  const record = records[recordIndex];
  record.product = {
    ...record.product,
    ...normalizeInventorySnapshot(inventoryItem)
  };
  record.managementNumbers = mergeUnique(record.managementNumbers, inventoryItem.managementNumbers || []);
  record.updatedAt = new Date().toISOString();

  return { records, record };
};

export const recordLedgerPurchase = ({
  inventoryItem,
  quantity = 0,
  unitPriceJPY = 0,
  eventDate = new Date().toISOString(),
  performer = '',
  reference = {},
  managementNumbers = []
}) => {
  if (!inventoryItem?.id) {
    console.warn('recordLedgerPurchase: inventoryItem.id is required');
    return;
  }

  const { records, record } = upsertRecord(inventoryItem);

  const qty = asNumber(quantity, 0);
  const unitPrice = asNumber(unitPriceJPY, 0);
  const totalCost = unitPrice * qty;

  record.managementNumbers = mergeUnique(record.managementNumbers, managementNumbers);

  record.purchase.events.push({
    date: eventDate,
    quantity: qty,
    unitPriceJPY: unitPrice,
    totalCostJPY: totalCost,
    performer,
    reference,
    sourceType: inventoryItem.sourceType || '',
    customer: inventoryItem.customer || null,
    supplier: inventoryItem.supplier || null
  });

  updatePurchaseSummary(record);
  updateLedgerStatus(record);
  record.updatedAt = new Date().toISOString();

  saveLedgerRecords(records);
};

export const recordLedgerSale = ({
  inventoryItem,
  saleId,
  quantity = 0,
  priceJPY = 0,
  priceUSD = 0,
  shippingFeeJPY = 0,
  shippingFeeUSD = 0,
  eventDate = new Date().toISOString(),
  buyer = {},
  salesChannel = '',
  staff = '',
  managementNumbers = [],
  notes = ''
}) => {
  if (!inventoryItem?.id) {
    console.warn('recordLedgerSale: inventoryItem.id is required');
    return;
  }

  const { records, record } = upsertRecord(inventoryItem);

  const qty = asNumber(quantity, 0);
  const totalPriceJPY = asNumber(priceJPY, 0);
  const totalPriceUSD = asNumber(priceUSD, 0);
  const shippingJPY = asNumber(shippingFeeJPY, 0);
  const shippingUSD = asNumber(shippingFeeUSD, 0);

  record.managementNumbers = mergeUnique(record.managementNumbers, managementNumbers);

  record.sale.events.push({
    saleId,
    date: eventDate,
    quantity: qty,
    totalPriceJPY,
    totalPriceUSD,
    unitPriceJPY: qty > 0 ? Math.round((totalPriceJPY / qty) * 100) / 100 : 0,
    unitPriceUSD: qty > 0 ? Math.round((totalPriceUSD / qty) * 100) / 100 : 0,
    shippingFeeJPY: shippingJPY,
    shippingFeeUSD: shippingUSD,
    buyer,
    salesChannel,
    staff,
    managementNumbers,
    notes
  });

  updateSaleSummary(record);
  updateLedgerStatus(record);
  record.updatedAt = new Date().toISOString();

  if (notes) {
    record.notes.push({
      date: eventDate,
      message: notes
    });
  }

  saveLedgerRecords(records);
};

export const removeLedgerRecordsByInventoryIds = (inventoryIds = []) => {
  if (!Array.isArray(inventoryIds) || inventoryIds.length === 0) {
    return;
  }

  const records = loadLedgerRecords();
  const filtered = records.filter(record => !inventoryIds.includes(record.inventoryId));
  saveLedgerRecords(filtered);
};

export const findLedgerRecord = (inventoryId) => {
  return loadLedgerRecords().find(record => record.inventoryId === inventoryId);
};

export const migrateLegacyLedgerData = () => {
  const records = loadLedgerRecords();
  if (records.length > 0) {
    return; // 既に新しいデータ構造が存在
  }

  const inventory = safeParseJSON(localStorage.getItem('inventory'), []);
  const salesHistory = safeParseJSON(localStorage.getItem('salesHistory'), []);

  if (inventory.length === 0 && salesHistory.length === 0) {
    return;
  }

  inventory.forEach(item => {
    recordLedgerPurchase({
      inventoryItem: item,
      quantity: item.quantity || 0,
      unitPriceJPY: item.acquisitionPrice || item.buybackPrice || 0,
      eventDate: item.registeredDate || new Date().toISOString(),
      performer: 'import',
      reference: { type: 'migration' },
      managementNumbers: item.managementNumbers || []
    });
  });

  salesHistory.forEach(sale => {
    const matchedInventory =
      inventory.find(inv => inv.id === sale.inventoryItemId) ||
      inventory.find(inv => inv.managementNumbers?.some(num => sale.managementNumbers?.includes(num))) ||
      {
        id: sale.inventoryItemId || `LEGACY-${sale.id}`,
        productType: sale.productType,
        manufacturer: sale.manufacturer,
        manufacturerLabel: sale.manufacturerLabel,
        console: sale.console,
        consoleLabel: sale.consoleLabel,
        color: sale.color,
        colorLabel: sale.colorLabel,
        softwareName: sale.softwareName,
        assessedRank: sale.assessedRank,
        title: sale.consoleLabel || sale.softwareName || 'ゲーム商品',
        sourceType: 'unknown',
        customer: null,
        supplier: null,
        managementNumbers: sale.managementNumbers || [],
        acquisitionPrice: sale.acquisitionPrice || 0,
        buybackPrice: sale.acquisitionPrice || 0,
        registeredDate: sale.soldAt || new Date().toISOString()
      };

    recordLedgerSale({
      inventoryItem: matchedInventory,
      saleId: sale.id,
      quantity: sale.quantity || sale.managementNumbers?.length || 1,
      priceJPY: sale.soldPrice || sale.totalSalesAmount || 0,
      priceUSD: sale.soldPriceUSD || 0,
      shippingFeeJPY: sale.shippingFee || sale.shippingFeeJPY || 0,
      shippingFeeUSD: sale.shippingFeeUSD || 0,
      eventDate: sale.soldAt || new Date().toISOString(),
      buyer: sale.buyer || sale.soldTo ? { name: sale.soldTo } : {},
      salesChannel: sale.salesChannel || '',
      staff: sale.salesStaffName || '',
      managementNumbers: sale.managementNumbers || [],
      notes: 'legacy-import'
    });
  });
};


