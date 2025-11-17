import React, { useState, useEffect } from 'react';
import { validateAndSanitize, validators } from '../utils/validation';
import { manufacturers, colors, gameConsoles } from '../data/gameConsoles';
import { getAllConsoles } from '../utils/productMaster';
import { generateProductCode } from '../utils/productCodeGenerator';
import { calculateBuyerPrice } from '../utils/priceCalculator';
import { createOutboundItemInZaico, logSyncActivity } from '../utils/zaicoClient';
import { recordLedgerSale } from '../utils/ledgerRecords';
import BuyerSelector from '../components/BuyerSelector';
import './Sales.css';

// 担当者リスト（Rating.jsxと同じ）
const staffMembers = [
  '佐藤 花子（Sato Hanako）',
  '鈴木 一郎（Suzuki Ichiro）',
  '田中 美咲（Tanaka Misaki）',
  '高橋 健太（Takahashi Kenta）'
];

// 担当者名から英語名を抽出
const getEnglishName = (fullName) => {
  if (!fullName) return '';
  const match = fullName.match(/（(.+?)）/);
  return match ? match[1] : fullName;
};

// 担当者名から日本語名を抽出　

const getJapaneseName = (fullName) => {
  if (!fullName) return '';
  const match = fullName.match(/^(.+?)（/);
  return match ? match[1] : fullName;
};

const ITEMS_PER_PAGE = 20;

const createPaginationRange = (currentPage, totalPages) => {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, idx) => idx + 1);
  }

  const range = [1];
  const start = Math.max(2, currentPage - 1);
  const end = Math.min(totalPages - 1, currentPage + 1);

  if (start > 2) {
    range.push('left-ellipsis');
  } else {
    for (let page = 2; page < start; page += 1) {
      range.push(page);
    }
  }

  for (let page = start; page <= end; page += 1) {
    range.push(page);
  }

  if (end < totalPages - 1) {
    range.push('right-ellipsis');
  } else {
    for (let page = end + 1; page < totalPages; page += 1) {
      range.push(page);
    }
  }

  range.push(totalPages);
  return range;
};

const Sales = () => {
  // 新しい構造: 'selection', 'new-sale', 'history', 'sale-detail'
  const [viewMode, setViewMode] = useState('selection');
  const [previousViewMode, setPreviousViewMode] = useState(null);
  
  // 新規販売作成用の状態
  const [selectedBuyer, setSelectedBuyer] = useState(null);
  const [showBuyerSelector, setShowBuyerSelector] = useState(false);
  const [saleStep, setSaleStep] = useState(1); // 1: バイヤー選択, 2: 商品選択, 3: 価格設定, 4: 発送情報, 5: 確認
  const [selectedItems, setSelectedItems] = useState([]); // 選択した商品リスト
  const [selectedInventories, setSelectedInventories] = useState({}); // { inventoryId: quantity } または { requestItemId: [{ invId, quantity }] }
  const [inventorySearchQuery, setInventorySearchQuery] = useState('');
  const [inventoryPage, setInventoryPage] = useState(1);
  const [itemPricesUSD, setItemPricesUSD] = useState({}); // { inventoryId: priceUSD }
  const [shippingFeeUSD, setShippingFeeUSD] = useState(0);
  const [shippingMethod, setShippingMethod] = useState('EMS');
  const [deliveryDays, setDeliveryDays] = useState('');
  const [trackingNumber, setTrackingNumber] = useState('');
  const [shippedDate, setShippedDate] = useState('');
  const [salesStaffName, setSalesStaffName] = useState('');
  const [notes, setNotes] = useState('');
  
  // 販売履歴
  const [salesHistory, setSalesHistory] = useState([]);
  const [selectedSaleId, setSelectedSaleId] = useState(null);
  
  // 管理番号モーダル
  const [showManagementNumberModal, setShowManagementNumberModal] = useState(false);
  const [currentManagementNumbers, setCurrentManagementNumbers] = useState([]);
  const [currentItemInfo, setCurrentItemInfo] = useState(null);
  
  // Validation states
  const [errors, setErrors] = useState({});
  const [touched, setTouched] = useState({});

  // Validate sales form
  const validateSalesForm = async () => {
    const validations = [];
    
    // Validate price inputs
    for (const [itemId, price] of Object.entries(itemPricesUSD)) {
      if (price !== null && price !== undefined) {
        const priceStr = price.toString();
        if (!/^\d+(\.\d{1,2})?$/.test(priceStr) || parseFloat(priceStr) < 0) {
          setErrors(prev => ({ ...prev, [`price_${itemId}`]: '有効な価格を入力してください' }));
          validations.push({ isValid: false });
        } else {
          validations.push({ isValid: true });
        }
      }
    }
    
    // Validate shipping fee
    if (shippingFeeUSD !== null && shippingFeeUSD !== undefined) {
      const feeStr = shippingFeeUSD.toString();
      if (!/^\d+(\.\d{1,2})?$/.test(feeStr) || parseFloat(feeStr) < 0) {
        setErrors(prev => ({ ...prev, shippingFee: '有効な送料を入力してください' }));
        validations.push({ isValid: false });
      } else {
        validations.push({ isValid: true });
      }
    }
    
    // Validate tracking number if provided
    if (trackingNumber) {
      const trackingValidation = await validateAndSanitize(trackingNumber, 'required');
      if (!trackingValidation.isValid) {
        setErrors(prev => ({ ...prev, trackingNumber: '追跡番号が無効です' }));
      }
      validations.push(trackingValidation);
    }
    
    // Validate staff name
    if (salesStaffName) {
      const staffValidation = await validateAndSanitize(salesStaffName, 'required');
      if (!staffValidation.isValid) {
        setErrors(prev => ({ ...prev, salesStaffName: '担当者名を選択してください' }));
      }
      validations.push(staffValidation);
    }
    
    return {
      validations,
      hasErrors: validations.some(v => !v.isValid)
    };
  };

  // Handle field blur
  const handleFieldBlur = (fieldName) => {
    setTouched(prev => ({ ...prev, [fieldName]: true }));
  };

  // 価格計算情報の表示
  const [priceCalculations, setPriceCalculations] = useState({});

  // 為替レート（USD to JPY）- 後で設定画面から変更可能にする
  const EXCHANGE_RATE = parseFloat(localStorage.getItem('exchangeRate') || '150');
  
  const getInventoryById = (inventoryList, targetId) => {
    return inventoryList.find(inv => String(inv.id) === String(targetId));
  };

  const buildSelectedInventoryItems = (inventoryList) => {
    const aggregated = new Map();

    Object.entries(selectedInventories).forEach(([key, value]) => {
      if (!value) return;

      const appendSelection = (inventoryId, quantity) => {
        const inv = getInventoryById(inventoryList, inventoryId);
        const qty = Number(quantity) || 0;
        if (!inv || qty <= 0) return;

        if (!aggregated.has(inv.id)) {
          aggregated.set(inv.id, {
            ...inv,
            selectedQuantity: 0,
            priceUSD: itemPricesUSD[inv.id] ?? 0
          });
        }

        const entry = aggregated.get(inv.id);
        entry.selectedQuantity += qty;
        if (itemPricesUSD[inv.id] !== undefined) {
          entry.priceUSD = itemPricesUSD[inv.id];
        }
      };

      if (Array.isArray(value)) {
        value.forEach(selection => {
          if (!selection) return;
          appendSelection(selection.invId, selection.quantity);
        });
      } else {
        appendSelection(key, value);
      }
    });

    return Array.from(aggregated.values());
  };

  // USDをJPYに変換（Zaico連携用）
  const convertUSDToJPY = (usd) => {
    return Math.round(usd * EXCHANGE_RATE);
  };
  
  // JPYをUSDに変換（表示用）
  const convertJPYToUSD = (jpy) => {
    return Math.round(jpy / EXCHANGE_RATE * 100) / 100;
  };

  // 日本時間の今日の日付を取得
  const getTodayJST = () => {
    const now = new Date();
    const jstOffset = 9 * 60;
    const jstTime = new Date(now.getTime() + jstOffset * 60 * 1000);
    return jstTime.toISOString().split('T')[0];
  };

  // JPYをUSDに変換
  const convertToUSD = (jpy) => {
    return Math.round(jpy / EXCHANGE_RATE * 100) / 100; // 小数点2桁
  };

  // 会社情報
  const companyInfo = {
    name: '株式会社ゲーム買取センター',
    nameEn: 'Game Trading Center Co., Ltd.',
    postalCode: '〒160-0022',
    address: '東京都新宿区新宿3-1-1',
    addressEn: '3-1-1 Shinjuku, Shinjuku-ku, Tokyo 160-0022, Japan',
    phone: 'TEL: 03-1234-5678',
    phoneEn: 'TEL: +81-3-1234-5678',
    email: 'info@game-kaitori.jp',
    license: '古物商許可証：東京都公安委員会 第123456789号',
    licenseEn: 'Used Goods Business License: Tokyo Metropolitan Police No. 123456789'
  };

  // 販売履歴を読み込み（完了した販売のみ）
  const loadSalesHistory = () => {
    const history = JSON.parse(localStorage.getItem('salesHistory') || '[]');
    // 海外販売のみをフィルタリング（salesChannel === 'overseas'）
    const overseasSales = history.filter(sale => sale.salesChannel === 'overseas');
    setSalesHistory(overseasSales);
  };

  useEffect(() => {
    loadSalesHistory();
    // 発送日を今日に設定
    const today = getTodayJST();
    setShippedDate(today);
  }, []);

  // ページがアクティブになった時にデータを再読み込み
  useEffect(() => {
    const handleStorageChange = (e) => {
      if (e.key === 'salesHistory') {
        loadSalesHistory();
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => {
      window.removeEventListener('storage', handleStorageChange);
    };
  }, []);

  // 新規販売作成を開始
  const handleStartNewSale = () => {
    setViewMode('new-sale');
    setSaleStep(1);
    setSelectedBuyer(null);
    setSelectedItems([]);
    setSelectedInventories({});
    setItemPricesUSD({});
    setShippingFeeUSD(0);
    setDeliveryDays('');
    setTrackingNumber('');
    setSalesStaffName('');
    setNotes('');
  };

  // 新規販売作成をキャンセル
  const handleCancelNewSale = () => {
    if (window.confirm('新規販売作成をキャンセルしますか？入力内容は失われます。')) {
      setViewMode('selection');
      setSaleStep(1);
      setSelectedBuyer(null);
      setSelectedItems([]);
      setSelectedInventories({});
      setItemPricesUSD({});
      setShippingFeeUSD(0);
      setDeliveryDays('');
      setTrackingNumber('');
      setSalesStaffName('');
      setNotes('');
    }
  };

  // 在庫から利用可能数を取得
  const getAvailableStock = (item) => {
    const inventoryData = JSON.parse(localStorage.getItem('inventory') || '[]');
    return inventoryData.filter(inv => 
      inv.console === item.console && 
      (!item.color || inv.color === item.color)
    ).reduce((sum, inv) => sum + (inv.quantity || 0), 0);
  };

  // 商品に対応する在庫リストを取得（ランク別）
  const getInventoryListForItem = (item) => {
    const inventoryData = JSON.parse(localStorage.getItem('inventory') || '[]');
    return inventoryData.filter(inv => 
      inv.console === item.console && 
      (!item.color || inv.color === item.color) &&
      (item.productType === 'software' ? inv.softwareName === item.softwareName : true) &&
      inv.quantity > 0
    ).sort((a, b) => {
      // ランク順 > 価格順（安い順）
      const rankOrder = { 'S': 1, 'A': 2, 'B': 3, 'C': 4 };
      if (rankOrder[a.assessedRank] !== rankOrder[b.assessedRank]) {
        return rankOrder[a.assessedRank] - rankOrder[b.assessedRank];
      }
      return (a.acquisitionPrice || a.buybackPrice) - (b.acquisitionPrice || b.buybackPrice);
    });
  };

  // 選択した在庫の合計仕入れ額を計算
  const calculateAcquisitionCost = (itemId) => {
    if (!selectedInventories[itemId]) return 0;
    const inventoryData = JSON.parse(localStorage.getItem('inventory') || '[]');
    
    return selectedInventories[itemId].reduce((sum, sel) => {
      const inv = inventoryData.find(i => i.id === sel.invId);
      if (inv) {
        const price = inv.acquisitionPrice || inv.buybackPrice || 0;
        return sum + (price * sel.quantity);
      }
      return sum;
    }, 0);
  };

  // 選択した在庫の合計数量
  const getSelectedQuantity = (itemId) => {
    if (!selectedInventories[itemId]) return 0;
    return selectedInventories[itemId].reduce((sum, sel) => sum + sel.quantity, 0);
  };

  // 管理番号を表示
  const handleShowManagementNumbers = (inv, selectedQuantity, itemInfo) => {
    if (!inv.managementNumbers || inv.managementNumbers.length === 0) {
      alert('この在庫には管理番号が登録されていません');
      return;
    }
    
    // 選択された数量分の管理番号を取得
    const numbers = inv.managementNumbers.slice(0, selectedQuantity);
    setCurrentManagementNumbers(numbers);
    setCurrentItemInfo({
      ...itemInfo,
      selectedQuantity: selectedQuantity,
      totalStock: inv.quantity,
      rank: inv.assessedRank
    });
    setShowManagementNumberModal(true);
  };

  // 在庫を選択（新構造用：inventoryIdを直接キーに使用）
  const handleSelectInventoryItem = (inventoryId, quantity) => {
    setSelectedInventories(prev => {
      if (quantity === 0) {
        // 数量0なら削除
        const newState = { ...prev };
        delete newState[inventoryId];
        return newState;
      } else {
        // 更新または追加
        return {
          ...prev,
          [inventoryId]: quantity
        };
      }
    });
  };

  // 在庫選択を追加（旧構造用：後で削除予定）
  const handleSelectInventory = (itemId, invId, quantity, requestedQuantity) => {
    // 現在の選択状況を取得
    const current = selectedInventories[itemId] || [];
    const existingIndex = current.findIndex(s => s.invId === invId);
    
    // 新しい合計数量を計算
    let newTotal = 0;
    if (quantity === 0) {
      // 削除する場合
      newTotal = current
        .filter(s => s.invId !== invId)
        .reduce((sum, s) => sum + s.quantity, 0);
    } else if (existingIndex !== -1) {
      // 更新する場合
      newTotal = current.reduce((sum, s) => 
        s.invId === invId ? sum + quantity : sum + s.quantity, 0);
    } else {
      // 新規追加する場合
      newTotal = current.reduce((sum, s) => sum + s.quantity, 0) + quantity;
    }
    
    // リクエスト数量を超えていないかチェック
    if (newTotal > requestedQuantity) {
      alert(`⚠️ 選択数量がリクエスト数量を超えています。\n\nリクエスト: ${requestedQuantity}台\n選択しようとした合計: ${newTotal}台\n\nリクエスト数量以下で選択してください。`);
      return;
    }
    
    setSelectedInventories(prev => {
      const current = prev[itemId] || [];
      const existingIndex = current.findIndex(s => s.invId === invId);
      
      if (quantity === 0) {
        // 数量0なら削除
        return {
          ...prev,
          [itemId]: current.filter(s => s.invId !== invId)
        };
      }
      
      if (existingIndex !== -1) {
        // 既存を更新
        const updated = [...current];
        updated[existingIndex] = { invId, quantity };
        return {
          ...prev,
          [itemId]: updated
        };
      } else {
        // 新規追加
        return {
          ...prev,
          [itemId]: [...current, { invId, quantity }]
        };
      }
    });
  };

  // ステータス更新
  const updateStatus = (newStatus) => {
    const updatedRequests = requests.map(req => 
      req.requestNumber === selectedRequestNumber 
        ? { ...req, status: newStatus }
        : req
    );
    setRequests(updatedRequests);
    localStorage.setItem('salesRequests', JSON.stringify(updatedRequests));
  };

  // 商品の見積もり価格/在庫数を更新
  const handleItemUpdate = (itemId, field, value) => {
    const updatedRequests = requests.map(req => {
      if (req.requestNumber === selectedRequestNumber) {
        return {
          ...req,
          items: req.items.map(item => 
            item.id === itemId 
              ? { 
                  ...item, 
                  [field]: value,
                  // 価格入力時はタイムスタンプを追加
                  ...(field === 'quotedPrice' ? { lastPriceUpdate: new Date().toISOString() } : {})
                }
              : item
          )
        };
      }
      return req;
    });
    setRequests(updatedRequests);
    localStorage.setItem('salesRequests', JSON.stringify(updatedRequests));
  };

  // 商品の価格を自動計算（バイヤー別価格調整適用）
  const calculateItemPrice = (item, buyerEmail) => {
    // 在庫から該当商品を探してランクを取得
    const inventoryData = JSON.parse(localStorage.getItem('inventory') || '[]');
    const matchingInventory = inventoryData.find(inv => 
      inv.console === item.console &&
      (!item.color || inv.color === item.color)
    );
    
    if (!matchingInventory) {
      return null; // 在庫なし
    }
    
    const rank = matchingInventory.assessedRank || 'A';
    const productCode = generateProductCode(item.manufacturer, item.console, item.productType);
    
    return calculateBuyerPrice(productCode, rank, buyerEmail);
  };

  // 全商品の価格を一括計算
  const calculateAllPrices = (forceUpdate = false) => {
    if (!currentReq || !currentReq.customer) return;
    
    const calculations = {};
    const updatedItems = currentReq.items.map(item => {
      const calc = calculateItemPrice(item, currentReq.customer.email);
      
      if (calc && calc.finalPrice > 0) {
        calculations[item.id] = calc;
        // 手動入力された価格の保護を強化
        const hasManualPrice = item.quotedPrice && item.quotedPrice > 0;
        const isRecentlyUpdated = item.lastPriceUpdate && 
          (Date.now() - new Date(item.lastPriceUpdate).getTime()) < 5000; // 5秒以内の更新
        
        // 強制更新または価格が未設定の場合のみ自動設定
        if (forceUpdate || (!hasManualPrice && !isRecentlyUpdated)) {
          return { 
            ...item, 
            quotedPrice: calc.finalPrice,
            lastPriceUpdate: new Date().toISOString()
          };
        }
      }
      
      return item;
    });
    
    setPriceCalculations(calculations);
    
    // リクエストを更新
    const updatedRequests = requests.map(req => 
      req.requestNumber === selectedRequestNumber
        ? { ...req, items: updatedItems }
        : req
    );
    setRequests(updatedRequests);
    localStorage.setItem('salesRequests', JSON.stringify(updatedRequests));
  };

  // 基準価格更新時の強制価格再計算（手動入力された価格も更新）
  const calculateAllPricesWithOverride = () => {
    if (!currentReq || !currentReq.customer) return;
    
    const calculations = {};
    const updatedItems = currentReq.items.map(item => {
      const calc = calculateItemPrice(item, currentReq.customer.email);
      
      if (calc && calc.finalPrice > 0) {
        calculations[item.id] = calc;
        // 基準価格が更新された場合は、手動入力された価格も更新
        return { ...item, quotedPrice: calc.finalPrice };
      }
      
      return item;
    });
    
    setPriceCalculations(calculations);
    
    // リクエストを更新
    const updatedRequests = requests.map(req => 
      req.requestNumber === selectedRequestNumber
        ? { ...req, items: updatedItems }
        : req
    );
    setRequests(updatedRequests);
    localStorage.setItem('salesRequests', JSON.stringify(updatedRequests));
  };

  // 見積もり確定
  const handleConfirmQuote = () => {
    // 全商品に価格が入力されているかチェック
    const allPriced = currentReq.items.every(item => item.quotedPrice && item.quotedPrice > 0);
    if (!allPriced) {
      alert('全ての商品に販売単価を入力してください');
      return;
    }

    // 配送期間をチェック
    if (!tempDeliveryDays || tempDeliveryDays.trim() === '') {
      alert('配送期間を入力してください');
      return;
    }

    // 担当者名のチェック
    if (!salesStaffName) {
      alert('販売担当者を選択してください');
      return;
    }

    const confirmAction = window.confirm('見積もりを確定してお客様に送信しますか？');
    if (!confirmAction) return;

    // 送料と配送期間と担当者名を保存
    const updatedRequests = requests.map(req => 
      req.requestNumber === selectedRequestNumber
        ? {
            ...req,
            shippingFee: tempShippingFee,
            deliveryDays: tempDeliveryDays,
            salesStaffName: salesStaffName,
            status: 'quoted'
          }
        : req
    );
    setRequests(updatedRequests);
    localStorage.setItem('salesRequests', JSON.stringify(updatedRequests));
    
    alert('見積もりを送信しました。');
  };

  // 発送完了処理（在庫減算 + 古物台帳記録）
  const handleCompleteSale = async (shippedDate, trackingNumber) => {
    // 在庫選択のチェック
    const mismatches = [];
    currentReq.items.forEach(item => {
      const selectedQty = getSelectedQuantity(item.id);
      if (selectedQty !== item.quantity) {
        const productName = item.productType === 'software' 
          ? item.softwareName 
          : `${item.manufacturerLabel} ${item.consoleLabel}`;
        mismatches.push(`${productName}: リクエスト${item.quantity}台 / 選択${selectedQty}台`);
      }
    });
    
    if (mismatches.length > 0) {
      alert(`⚠️ 在庫選択数量がリクエストと一致していません：\n\n${mismatches.join('\n')}\n\nすべての商品について、リクエスト数量と同じ数量の在庫を選択してください。`);
      return;
    }
    
    const confirmAction = window.confirm('発送完了にしますか？\n在庫が減算され、古物台帳に記録されます。\nこの操作は取り消せません。');
    if (!confirmAction) return;

    // 在庫データを取得（減算前）
    const inventoryData = JSON.parse(localStorage.getItem('inventory') || '[]');
    
    // zaico連携処理（在庫減算前に行う）
    try {
      for (const item of currentReq.items) {
        const selectedInvs = selectedInventories[item.id] || [];
        const salesPricePerUnit = item.quotedPrice;
        
        for (const sel of selectedInvs) {
          const inv = inventoryData.find(inv => inv.id === sel.invId);
          if (inv) {
            const zaicoSaleData = {
              title: inv.title || inv.consoleLabel || inv.softwareName || 'ゲーム商品',
              inventoryId: inv.id,
              quantity: sel.quantity,
              salePrice: salesPricePerUnit,
              customerName: currentReq.customer.name,
              buyerName: currentReq.customer.name,
              salesChannel: '海外販売',
              shippingCountry: currentReq.customer.country || '海外',
              shippingFee: currentReq.shippingFee || 0,
              notes: `海外販売: ${currentReq.requestNumber} | 査定ランク: ${inv.assessedRank || ''} | 担当者: ${currentReq.salesStaffName || ''}`
            };
            
            console.log('=== 出庫処理デバッグ情報 ===');
            console.log('zaicoSaleData:', zaicoSaleData);
            console.log('在庫データ:', inv);
            console.log('zaicoId:', inv.zaicoId);
            
            await createOutboundItemInZaico(zaicoSaleData);
            
            logSyncActivity('overseas_sale_create', 'success', {
              requestNumber: currentReq.requestNumber,
              itemId: inv.id,
              customerName: currentReq.customer.name,
              soldPrice: salesPricePerUnit,
              quantity: sel.quantity,
              method: 'overseas_outbound_with_customer_and_price'
            });
          }
        }
      }
      
      console.log('zaico海外販売出庫データ作成成功');
    } catch (error) {
      logSyncActivity('overseas_sale_create', 'error', {
        requestNumber: currentReq.requestNumber,
        error: error.message
      });
      console.error('zaico海外販売出庫データ作成エラー:', error);
    }
    
    // 在庫から減算
    const salesLedger = JSON.parse(localStorage.getItem('salesLedger') || '[]');
    
    const salesRecord = {
      id: `SALE-${Date.now()}`,
      type: 'sales',
      requestNumber: currentReq.requestNumber,
      soldDate: new Date().toISOString(),
      customer: currentReq.customer,
      items: [],
      summary: {
        totalAcquisitionCost: 0,
        totalSalesAmount: 0,
        totalProfit: 0
      }
    };

    // 各商品の在庫減算と台帳記録
    currentReq.items.forEach(item => {
      const selectedInvs = selectedInventories[item.id] || [];
      const salesPricePerUnit = item.quotedPrice; // quotedPriceは既に円
      
      selectedInvs.forEach(sel => {
        const invIndex = inventoryData.findIndex(inv => inv.id === sel.invId);
        if (invIndex !== -1) {
          const inv = inventoryData[invIndex];
          const acquisitionPrice = inv.acquisitionPrice || inv.buybackPrice || 0;
          const totalAcquisitionCost = acquisitionPrice * sel.quantity;
          const totalSalesAmount = salesPricePerUnit * sel.quantity;
          const totalProfit = totalSalesAmount - totalAcquisitionCost;

          // 台帳に記録
          salesRecord.items.push({
            inventoryId: inv.id,
            product: item.productType === 'software' 
              ? `${item.softwareName} (${item.consoleLabel})` 
              : `${item.consoleLabel}${item.colorLabel ? ' - ' + item.colorLabel : ''}`,
            rank: inv.assessedRank,
            quantity: sel.quantity,
            acquisitionPrice: acquisitionPrice,
            totalAcquisitionCost: totalAcquisitionCost,
            salesPrice: salesPricePerUnit,
            totalSalesAmount: totalSalesAmount,
            profit: salesPricePerUnit - acquisitionPrice,
            totalProfit: totalProfit,
            source: inv.sourceType === 'customer' 
              ? { type: 'customer', name: inv.customer?.name || '不明', applicationNumber: inv.applicationNumber }
              : { type: 'supplier', name: inv.supplier?.name || '不明', invoiceNumber: inv.supplier?.invoiceNumber || '' }
          });

          // サマリーに加算
          salesRecord.summary.totalAcquisitionCost += totalAcquisitionCost;
          salesRecord.summary.totalSalesAmount += totalSalesAmount;
          salesRecord.summary.totalProfit += totalProfit;

          // salesHistoryに販売記録を追加（買取記録を生成するため）
          const salesHistory = JSON.parse(localStorage.getItem('salesHistory') || '[]');
          salesHistory.push({
            id: `SALE-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            inventoryItemId: inv.id,
            productType: inv.productType,
            manufacturer: inv.manufacturer,
            manufacturerLabel: inv.manufacturerLabel,
            console: inv.console,
            consoleLabel: inv.consoleLabel,
            color: inv.color,
            colorLabel: inv.colorLabel,
            softwareName: inv.softwareName,
            assessedRank: inv.assessedRank,
            quantity: sel.quantity,
            acquisitionPrice: acquisitionPrice,
            soldPrice: salesPricePerUnit,
            profit: salesPricePerUnit - acquisitionPrice,
            salesChannel: 'overseas',
            soldTo: currentReq.customer.name,
            soldAt: new Date().toISOString(),
            managementNumbers: (inv.managementNumbers || []).slice(0, sel.quantity),
            // 買取記録を生成するための情報
            buybackInfo: {
              applicationNumber: inv.applicationNumber,
              buybackPrice: acquisitionPrice,
              buybackDate: inv.registeredDate,
              customer: inv.customer || null
            }
          });
          localStorage.setItem('salesHistory', JSON.stringify(salesHistory));
          
          // 在庫を減算
          const beforeQuantity = inventoryData[invIndex].quantity;
          inventoryData[invIndex].quantity -= sel.quantity;
          
          // 在庫変更履歴を記録
          const inventoryHistory = JSON.parse(localStorage.getItem('inventoryHistory') || '[]');
          inventoryHistory.push({
            itemId: inv.id,
            type: 'sale',
            change: -sel.quantity,
            beforeQuantity: beforeQuantity,
            afterQuantity: inventoryData[invIndex].quantity,
            date: new Date().toISOString(),
            performedBy: currentReq.salesStaffName || 'スタッフ',
            reason: `販売処理（${currentReq.requestNumber}）`,
            relatedTransaction: {
              type: 'sales',
              requestNumber: currentReq.requestNumber,
              customer: currentReq.customer.name
            }
          });
          localStorage.setItem('inventoryHistory', JSON.stringify(inventoryHistory));
        }
      });
    });

    // 在庫0の商品を削除
    const filteredInventory = inventoryData.filter(inv => inv.quantity > 0);
    localStorage.setItem('inventory', JSON.stringify(filteredInventory));

    // 古物台帳に記録
    salesLedger.push(salesRecord);
    localStorage.setItem('salesLedger', JSON.stringify(salesLedger));

    // リクエストに選択した在庫情報を保存
    const updatedRequests = requests.map(req =>
      req.requestNumber === selectedRequestNumber
        ? {
            ...req,
            status: 'shipped',
            shippedDate: shippedDate,
            trackingNumber: trackingNumber,
            selectedInventories: selectedInventories,
            salesRecordId: salesRecord.id
          }
        : req
    );
    setRequests(updatedRequests);
    localStorage.setItem('salesRequests', JSON.stringify(updatedRequests));

    // zaico連携処理は在庫減算前に実行済み

    alert(`発送完了しました。\n在庫を更新し、古物台帳に記録しました。\n\n利益: ¥${salesRecord.summary.totalProfit.toLocaleString()}`);
    setShowInventorySelection(false);
  };

  // 見積書印刷
  const handlePrint = () => {
    if (!currentReq || !currentReq.items || currentReq.items.length === 0) {
      alert('印刷する商品がありません');
      return;
    }
    
    // 見積書のみを印刷するためのスタイルを一時的に適用
    const printStyle = document.createElement('style');
    printStyle.textContent = `
      @media print {
        .invoice-sheet { display: none !important; }
        .estimate-sheet { display: block !important; }
        .no-print { display: none !important; }
      }
    `;
    document.head.appendChild(printStyle);
    
    // 見積書を表示
    const estimateElement = document.querySelector('.estimate-sheet');
    if (estimateElement) {
      estimateElement.style.display = 'block';
    }
    
    // インボイスを非表示
    const invoiceElement = document.querySelector('.invoice-sheet');
    if (invoiceElement) {
      invoiceElement.style.display = 'none';
    }
    
    window.print();
    
    // 印刷後、スタイルを削除
    document.head.removeChild(printStyle);
    if (invoiceElement) {
      invoiceElement.style.display = 'none';
    }
    if (estimateElement) {
      estimateElement.style.display = 'none';
    }
  };

  // インボイス印刷
  const handlePrintInvoice = () => {
    if (!currentReq || !currentReq.items || currentReq.items.length === 0) {
      alert('印刷する商品がありません');
      return;
    }
    
    // インボイス印刷用のスタイルを一時的に適用
    const printStyle = document.createElement('style');
    printStyle.textContent = `
      @media print {
        .estimate-sheet { display: none !important; }
        .invoice-sheet { display: block !important; }
        .no-print { display: none !important; }
      }
    `;
    document.head.appendChild(printStyle);
    
    // インボイス印刷用のクラスを追加
    const invoiceElement = document.querySelector('.invoice-sheet');
    if (invoiceElement) {
      invoiceElement.style.display = 'block';
    }
    
    window.print();
    
    // 印刷後、スタイルを削除
    document.head.removeChild(printStyle);
    if (invoiceElement) {
      invoiceElement.style.display = 'none';
    }
  };

  // 印刷用の送料・配送期間取得
  const getPrintShippingFee = () => {
    return currentReq.status === 'pending' ? tempShippingFee : (currentReq.shippingFee || 0);
  };

  const getPrintDeliveryDays = () => {
    return currentReq.status === 'pending' ? tempDeliveryDays : (currentReq.deliveryDays || '');
  };

  // 合計金額計算
  const calculateTotal = () => {
    if (!currentReq || !currentReq.items) return 0;
    return currentReq.items.reduce((sum, item) => {
      return sum + (item.quotedPrice || 0) * item.quantity;
    }, 0);
  };

  // 商品の原産国を取得
  const getCountryOfOrigin = (item) => {
    if (item.productType === 'software') {
      // ソフトウェアの場合は親機種の原産国を取得
      const consoleData = Object.values(gameConsoles).flat().find(console => 
        console.value === item.console
      );
      return consoleData?.country || 'China';
    } else {
      // ハードウェアの場合は直接取得
      const consoleData = Object.values(gameConsoles).flat().find(console => 
        console.value === item.console
      );
      return consoleData?.country || 'China';
    }
  };

  // インボイス印刷用の発送情報を取得
  const getInvoiceShippingInfo = () => {
    // 発送完了済みの場合は保存された値を使用
    if (currentReq.shippedDate && currentReq.trackingNumber) {
      return {
        shippedDate: currentReq.shippedDate,
        trackingNumber: currentReq.trackingNumber
      };
    }
    
    // 発送完了前の場合は入力フィールドから取得
    const dateElement = document.getElementById('shippedDate');
    const trackingElement = document.getElementById('trackingNumber');
    
    return {
      shippedDate: dateElement?.value || getTodayJST(),
      trackingNumber: trackingElement?.value || ''
    };
  };

  // 総重量を計算
  const calculateTotalWeight = () => {
    if (!currentReq || !currentReq.items) return 0;
    return currentReq.items.reduce((sum, item) => {
      return sum + (item.weight || 0);
    }, 0);
  };

  // リストに戻る
  const handleBackToList = () => {
    setViewMode(previousViewMode || 'selection');
    setSelectedRequestNumber(null);
    setPreviousViewMode(null);
  };

  // カードクリックで詳細表示
  const handleCardClick = (requestNumber, from) => {
    setSelectedRequestNumber(requestNumber);
    setPreviousViewMode(from);
    setViewMode('detail');
  };

  // ステータスに応じたフィルタリング
  const getFilteredRequests = () => {
    let filtered = requests;

    if (viewMode === 'pending') {
      // 進行中の取引（shipped以外）
      filtered = requests.filter(req => req.status !== 'shipped');
    } else if (viewMode === 'completed') {
      // 完了した取引（shipped）
      filtered = requests.filter(req => req.status === 'shipped');
    } else if (viewMode === 'detail') {
      // 詳細画面では、前の画面に応じてフィルタリング
      if (previousViewMode === 'pending') {
        filtered = requests.filter(req => req.status !== 'shipped');
      } else if (previousViewMode === 'completed') {
        filtered = requests.filter(req => req.status === 'shipped');
      }
    }

    // ステータスフィルター（詳細画面から来た場合のみ）
    if (statusFilter !== 'all' && (viewMode === 'pending' || (viewMode === 'detail' && previousViewMode === 'pending'))) {
      filtered = filtered.filter(req => req.status === statusFilter);
    }

    return filtered.sort((a, b) => new Date(b.date) - new Date(a.date));
  };

  // ステータスラベル
  const getStatusLabel = (status) => {
    const labels = {
      pending: '見積もり待ち',
      quoted: '見積もり送信済',
      approved: '承認済',
      payment_confirmed: '入金確認済',
      shipped: '発送完了'
    };
    return labels[status] || status;
  };

  const getStatusEmoji = (status) => {
    const emojis = {
      pending: '⏳',
      quoted: '📋',
      approved: '✅',
      payment_confirmed: '💳',
      shipped: '📦'
    };
    return emojis[status] || '📄';
  };

  const rawInventoryData = saleStep === 2 ? JSON.parse(localStorage.getItem('inventory') || '[]') : [];
  const availableInventory = saleStep === 2 ? rawInventoryData.filter(inv => inv.quantity > 0) : [];
  const normalizedInventoryQuery = inventorySearchQuery.trim().toLowerCase();
  const filteredInventory = saleStep === 2
    ? availableInventory.filter(inv => {
        if (!normalizedInventoryQuery) {
          return true;
        }

        const searchableContent = [
          inv.consoleLabel,
          inv.console,
          inv.colorLabel,
          inv.color,
          inv.assessedRank,
          inv.productType,
          inv.softwareName,
          inv.managementNumbers ? inv.managementNumbers.join(' ') : '',
          inv.serialNumber
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();

        return searchableContent.includes(normalizedInventoryQuery);
      })
    : [];
  const totalInventoryPages = saleStep === 2
    ? Math.max(1, Math.ceil(filteredInventory.length / ITEMS_PER_PAGE))
    : 1;
  const currentInventoryPage = saleStep === 2
    ? Math.min(Math.max(inventoryPage, 1), totalInventoryPages)
    : 1;
  const paginatedInventory = saleStep === 2
    ? filteredInventory.slice(
        (currentInventoryPage - 1) * ITEMS_PER_PAGE,
        (currentInventoryPage - 1) * ITEMS_PER_PAGE + ITEMS_PER_PAGE
      )
    : [];

  useEffect(() => {
    if (saleStep !== 2) {
      if (inventorySearchQuery !== '') {
        setInventorySearchQuery('');
      }
      if (inventoryPage !== 1) {
        setInventoryPage(1);
      }
      return;
    }

    const totalPages = Math.max(1, Math.ceil(filteredInventory.length / ITEMS_PER_PAGE));
    if (inventoryPage > totalPages) {
      setInventoryPage(totalPages);
    } else if (inventoryPage < 1) {
      setInventoryPage(1);
    }
  }, [saleStep, filteredInventory.length, inventoryPage, inventorySearchQuery]);

  // === 選択画面 ===
  if (viewMode === 'selection') {
    return (
      <div className="sales-container">
        <h1>🌍 海外販売管理</h1>
        <p className="subtitle">スタッフが直接販売を作成・管理します</p>

        <div className="selection-screen">
          <button 
            className="selection-btn new-sale-btn"
            onClick={handleStartNewSale}
          >
            <div className="btn-icon">➕</div>
            <div className="btn-title">新規販売作成</div>
            <div className="btn-description">バイヤーを選択して商品を販売</div>
          </button>

          <button 
            className="selection-btn history-btn"
            onClick={() => setViewMode('history')}
          >
            <div className="btn-icon">📦</div>
            <div className="btn-title">販売履歴</div>
            <div className="btn-description">完了した販売の一覧・詳細</div>
            {salesHistory.length > 0 && <div className="btn-count">{salesHistory.length}件</div>}
          </button>
        </div>
      </div>
    );
  }

  // === 新規販売作成画面 ===
  if (viewMode === 'new-sale') {
    // ステップ1: バイヤー選択
    if (saleStep === 1) {
      return (
        <div className="sales-container">
          <div className="list-header">
            <h1>🌍 新規販売作成 - ステップ1: バイヤー選択</h1>
            <button className="back-btn" onClick={handleCancelNewSale}>
              ← キャンセル
            </button>
          </div>
          
          <div className="step-indicator">
            <div className={`step ${saleStep >= 1 ? (saleStep === 1 ? 'active' : 'completed') : ''}`}>1. バイヤー選択</div>
            <div className={`step-connector ${saleStep >= 2 ? 'completed' : ''}`}></div>
            <div className={`step ${saleStep >= 2 ? (saleStep === 2 ? 'active' : 'completed') : ''}`}>2. 商品選択</div>
            <div className={`step-connector ${saleStep >= 3 ? 'completed' : ''}`}></div>
            <div className={`step ${saleStep >= 3 ? (saleStep === 3 ? 'active' : 'completed') : ''}`}>3. 価格設定</div>
            <div className={`step-connector ${saleStep >= 4 ? 'completed' : ''}`}></div>
            <div className={`step ${saleStep >= 4 ? (saleStep === 4 ? 'active' : 'completed') : ''}`}>4. 発送情報</div>
            <div className={`step-connector ${saleStep >= 5 ? 'completed' : ''}`}></div>
            <div className={`step ${saleStep >= 5 ? (saleStep === 5 ? 'active' : 'completed') : ''}`}>5. 確認</div>
          </div>

          <div className="buyer-selection-section">
            {selectedBuyer ? (
              <div className="selected-buyer-card">
                <h3>選択中のバイヤー</h3>
                <div className="buyer-info">
                  <div><strong>名前:</strong> {selectedBuyer.name}</div>
                  {selectedBuyer.companyName && <div><strong>会社名:</strong> {selectedBuyer.companyName}</div>}
                  <div><strong>国:</strong> {selectedBuyer.country}</div>
                  <div><strong>メール:</strong> {selectedBuyer.email}</div>
                  {selectedBuyer.phone && <div><strong>電話:</strong> {selectedBuyer.phone}</div>}
                </div>
                <div className="button-group">
                  <button className="btn-secondary" onClick={() => setSelectedBuyer(null)}>
                    変更
                  </button>
                  <button className="btn-primary" onClick={() => setSaleStep(2)}>
                    次へ →
                  </button>
                </div>
              </div>
            ) : (
              <div className="buyer-selector-section">
                <button className="btn-select-buyer" onClick={() => setShowBuyerSelector(true)}>
                  🌍 バイヤーを選択
                </button>
              </div>
            )}
          </div>

          {showBuyerSelector && (
            <BuyerSelector
              selectedBuyer={selectedBuyer}
              onSelectBuyer={(buyer) => {
                setSelectedBuyer(buyer);
                setShowBuyerSelector(false);
              }}
              onClose={() => setShowBuyerSelector(false)}
            />
          )}
        </div>
      );
    }

    // ステップ2: 商品選択
    if (saleStep === 2) {
      // 選択された在庫の合計数量を計算
      const totalSelectedQuantity = Object.values(selectedInventories).reduce((sum, qty) => sum + qty, 0);
      const paginationRange = createPaginationRange(currentInventoryPage, totalInventoryPages);
      const startIndex = filteredInventory.length === 0 ? 0 : (currentInventoryPage - 1) * ITEMS_PER_PAGE + 1;
      const endIndex = startIndex === 0 ? 0 : Math.min(startIndex + paginatedInventory.length - 1, filteredInventory.length);
      
      return (
        <div className="sales-container">
          <div className="list-header">
            <h1>🌍 新規販売作成 - ステップ2: 商品選択</h1>
            <button className="back-btn" onClick={() => setSaleStep(1)}>
              ← 戻る
            </button>
          </div>
          
          <div className="step-indicator">
            <div className="step completed">1. バイヤー選択</div>
            <div className="step active">2. 商品選択</div>
            <div className="step">3. 価格設定</div>
            <div className="step">4. 発送情報</div>
            <div className="step">5. 確認</div>
          </div>

          <div className="selected-buyer-info">
            <h3>選択中のバイヤー: {selectedBuyer?.name}</h3>
          </div>

          <div className="inventory-selection-section">
            <div className="selection-summary">
              <p>選択中の商品: {Object.keys(selectedInventories).length}種類、合計 {totalSelectedQuantity}点</p>
              <p>
                表示範囲: {startIndex === 0 ? 0 : `${startIndex} - ${endIndex}`} / {filteredInventory.length}件
                （全在庫 {availableInventory.length}件）
              </p>
            </div>

            <div className="inventory-search-bar">
              <input
                type="text"
                placeholder="商品名・カラー・型番などで検索"
                value={inventorySearchQuery}
                onChange={(e) => {
                  setInventorySearchQuery(e.target.value);
                  setInventoryPage(1);
                }}
              />
              {inventorySearchQuery && (
                <button
                  type="button"
                  className="clear-search-btn"
                  onClick={() => {
                    setInventorySearchQuery('');
                    setInventoryPage(1);
                  }}
                >
                  クリア
                </button>
              )}
            </div>

            <div className="inventory-list">
              <h3>在庫一覧（{filteredInventory.length}件）</h3>
              {filteredInventory.length === 0 ? (
                <div className="inventory-empty">該当する在庫がありません</div>
              ) : (
                <>
                  <table className="inventory-selection-table">
                    <thead>
                      <tr>
                        <th>選択</th>
                        <th>商品名</th>
                        <th>カラー</th>
                        <th>ランク</th>
                        <th>参考価格<br/>(Zaico買取価格)</th>
                        <th>在庫数</th>
                        <th>選択数量</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedInventory.map(inv => {
                        const selectedQty = selectedInventories[inv.id] || 0;
                        const buybackPrice = inv.buybackPrice || inv.acquisitionPrice || 0;
                        const buybackPriceUSD = buybackPrice > 0 ? convertJPYToUSD(buybackPrice) : 0;
                        return (
                          <tr key={inv.id}>
                            <td>
                              <input
                                type="checkbox"
                                checked={selectedQty > 0}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    handleSelectInventoryItem(inv.id, 1);
                                  } else {
                                    handleSelectInventoryItem(inv.id, 0);
                                  }
                                }}
                              />
                            </td>
                            <td>
                              {inv.productType === 'software' 
                                ? `${inv.softwareName || ''} (${inv.consoleLabel || ''})`
                                : inv.consoleLabel || ''}
                            </td>
                            <td>{inv.colorLabel || '-'}</td>
                            <td>
                              <span className={`rank-badge rank-${(inv.assessedRank || 'A').toLowerCase()}`}>
                                {inv.assessedRank || 'A'}
                              </span>
                            </td>
                            <td className="reference-price-cell">
                              {buybackPrice > 0 ? (
                                <div>
                                  <div style={{ fontWeight: '600', color: '#2c3e50' }}>
                                    ¥{buybackPrice.toLocaleString()}
                                  </div>
                                  <div style={{ fontSize: '12px', color: '#7f8c8d', marginTop: '2px' }}>
                                    (約 ${buybackPriceUSD.toFixed(2)})
                                  </div>
                                </div>
                              ) : (
                                <span style={{ color: '#95a5a6', fontSize: '13px' }}>-</span>
                              )}
                            </td>
                            <td>{inv.quantity}</td>
                            <td>
                              {selectedQty > 0 && (
                                <input
                                  type="number"
                                  min="0"
                                  max={inv.quantity}
                                  value={selectedQty}
                              onWheel={(e) => e.currentTarget.blur()}
                                  onChange={(e) => {
                                    const newQty = parseInt(e.target.value, 10) || 0;
                                    if (newQty <= inv.quantity) {
                                      handleSelectInventoryItem(inv.id, newQty);
                                    }
                                  }}
                                  style={{ width: '60px' }}
                                />
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>

                  <div className="inventory-pagination">
                    <button
                      type="button"
                      className="page-btn"
                      onClick={() => setInventoryPage(1)}
                      disabled={currentInventoryPage === 1}
                    >
                      «
                    </button>
                    <button
                      type="button"
                      className="page-btn"
                      onClick={() => setInventoryPage(Math.max(currentInventoryPage - 1, 1))}
                      disabled={currentInventoryPage === 1}
                    >
                      ‹
                    </button>
                    {paginationRange.map((item, idx) => {
                      if (item === 'left-ellipsis' || item === 'right-ellipsis') {
                        return (
                          <span key={`${item}-${idx}`} className="page-ellipsis">…</span>
                        );
                      }

                      return (
                        <button
                          type="button"
                          key={item}
                          className={`page-btn ${item === currentInventoryPage ? 'active' : ''}`}
                          onClick={() => setInventoryPage(item)}
                        >
                          {item}
                        </button>
                      );
                    })}
                    <button
                      type="button"
                      className="page-btn"
                      onClick={() => setInventoryPage(Math.min(currentInventoryPage + 1, totalInventoryPages))}
                      disabled={currentInventoryPage === totalInventoryPages}
                    >
                      ›
                    </button>
                    <button
                      type="button"
                      className="page-btn"
                      onClick={() => setInventoryPage(totalInventoryPages)}
                      disabled={currentInventoryPage === totalInventoryPages}
                    >
                      »
                    </button>
                  </div>
                </>
              )}
            </div>

            <div className="button-group" style={{ marginTop: '20px' }}>
              <button className="btn-secondary" onClick={() => setSaleStep(1)}>
                ← 戻る
              </button>
              <button 
                className="btn-primary" 
                onClick={() => {
                  if (totalSelectedQuantity === 0) {
                    alert('少なくとも1つ以上の商品を選択してください');
                    return;
                  }
                  setSaleStep(3);
                }}
                disabled={totalSelectedQuantity === 0}
              >
                次へ →
              </button>
            </div>
          </div>
        </div>
      );
    }

    // ステップ3: 価格設定（USD建て）
    if (saleStep === 3) {
      const inventoryData = JSON.parse(localStorage.getItem('inventory') || '[]');
      const selectedInventoryItems = buildSelectedInventoryItems(inventoryData);

      // 合計金額を計算
      const totalUSD = selectedInventoryItems.reduce((sum, item) => {
        return sum + (item.priceUSD * item.selectedQuantity);
      }, 0);
      const totalSalesJPY = convertUSDToJPY(totalUSD);
      const totalAcquisitionJPY = selectedInventoryItems.reduce((sum, item) => {
        const acquisitionPrice = item.acquisitionPrice || item.buybackPrice || 0;
        return sum + (acquisitionPrice * item.selectedQuantity);
      }, 0);
      const totalProfitJPY = totalSalesJPY - totalAcquisitionJPY;
      const profitMargin = totalSalesJPY > 0 ? Math.round((totalProfitJPY / totalSalesJPY) * 1000) / 10 : 0;
      const hasPricing = selectedInventoryItems.some(item => item.priceUSD > 0);
      const profitBreakdown = selectedInventoryItems.map(item => {
        const unitSaleUSD = item.priceUSD || 0;
        const saleUSD = unitSaleUSD * item.selectedQuantity;
        const saleJPY = convertUSDToJPY(saleUSD);
        const acquisitionPrice = item.acquisitionPrice || item.buybackPrice || 0;
        const acquisitionJPY = acquisitionPrice * item.selectedQuantity;
        const profitJPY = saleJPY - acquisitionJPY;

        return {
          id: item.id,
          name: item.productType === 'software'
            ? `${item.softwareName || ''} (${item.consoleLabel || ''})`
            : item.consoleLabel || '',
          rank: item.assessedRank || 'A',
          quantity: item.selectedQuantity,
          saleUSD,
          saleJPY,
          acquisitionJPY,
          profitJPY,
          unitSaleUSD
        };
      });

      return (
        <div className="sales-container">
          <div className="list-header">
            <h1>🌍 新規販売作成 - ステップ3: 価格設定</h1>
            <button className="back-btn" onClick={() => setSaleStep(2)}>
              ← 戻る
            </button>
          </div>
          
          <div className="step-indicator">
            <div className="step completed">1. バイヤー選択</div>
            <div className="step completed">2. 商品選択</div>
            <div className="step active">3. 価格設定</div>
            <div className="step">4. 発送情報</div>
            <div className="step">5. 確認</div>
          </div>

          <div className="price-setting-section">
            <div className="info-box">
              <p>💡 価格はUSD（米ドル）で入力してください。為替レート: $1 = ¥{EXCHANGE_RATE}</p>
            </div>

            <table className="price-setting-table">
              <thead>
                <tr>
                  <th>商品名</th>
                  <th>カラー</th>
                  <th>ランク</th>
                  <th>数量</th>
                  <th>参考価格<br/>(Zaico買取価格)</th>
                  <th>販売単価（USD）</th>
                  <th>小計（USD）</th>
                </tr>
              </thead>
              <tbody>
                {selectedInventoryItems.map(item => {
                  const subtotal = item.priceUSD * item.selectedQuantity;
                  const buybackPrice = item.buybackPrice || item.acquisitionPrice || 0;
                  const buybackPriceUSD = buybackPrice > 0 ? convertJPYToUSD(buybackPrice) : 0;
                  return (
                    <tr key={item.id}>
                      <td>
                        {item.productType === 'software' 
                          ? `${item.softwareName || ''} (${item.consoleLabel || ''})`
                          : item.consoleLabel || ''}
                      </td>
                      <td>{item.colorLabel || '-'}</td>
                      <td>
                        <span className={`rank-badge rank-${(item.assessedRank || 'A').toLowerCase()}`}>
                          {item.assessedRank || 'A'}
                        </span>
                      </td>
                      <td>{item.selectedQuantity}</td>
                      <td className="reference-price-cell">
                        {buybackPrice > 0 ? (
                          <div>
                            <div style={{ fontWeight: '600', color: '#2c3e50', fontSize: '14px' }}>
                              ¥{buybackPrice.toLocaleString()}
                            </div>
                            <div style={{ fontSize: '12px', color: '#7f8c8d', marginTop: '2px' }}>
                              (約 ${buybackPriceUSD.toFixed(2)})
                            </div>
                            <div style={{ fontSize: '11px', color: '#95a5a6', marginTop: '4px', fontStyle: 'italic' }}>
                              参考価格
                            </div>
                          </div>
                        ) : (
                          <span style={{ color: '#95a5a6', fontSize: '13px' }}>-</span>
                        )}
                      </td>
                      <td>
                        <div className="price-input-wrapper">
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={item.priceUSD || ''}
                            onChange={(e) => {
                              const price = parseFloat(e.target.value) || 0;
                              setItemPricesUSD(prev => ({
                                ...prev,
                                [item.id]: price
                              }));
                            }}
                            style={{ width: '100px' }}
                            placeholder={buybackPriceUSD > 0 ? `例: ${buybackPriceUSD.toFixed(2)}` : ''}
                          />
                          {item.priceUSD > 0 && (
                            <div className="price-conversion-hint">
                              ≈ ¥{convertUSDToJPY(item.priceUSD).toLocaleString()}
                            </div>
                          )}
                        </div>
                      </td>
                      <td>
                        <div>
                          <div style={{ fontWeight: '600' }}>${subtotal.toFixed(2)}</div>
                          {item.priceUSD > 0 && (
                            <div className="price-conversion-hint" style={{ marginTop: '2px' }}>
                              ≈ ¥{convertUSDToJPY(subtotal).toLocaleString()}
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan="6" style={{ textAlign: 'right', fontWeight: 'bold' }}>合計（USD）:</td>
                  <td style={{ fontWeight: 'bold' }}>
                    <div>
                      <div>${totalUSD.toFixed(2)}</div>
                      {totalUSD > 0 && (
                        <div className="price-conversion-hint" style={{ marginTop: '4px', fontSize: '13px' }}>
                          ≈ ¥{convertUSDToJPY(totalUSD).toLocaleString()}
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              </tfoot>
            </table>

            {hasPricing && (
              <div className="profit-estimate-section">
                <h2>💹 粗利益試算（送料はこの時点では未計上）</h2>
                <div className="profit-estimate-grid">
                  <div className="profit-estimate-card">
                    <span className="label">販売合計</span>
                    <span className="value">¥{totalSalesJPY.toLocaleString()}</span>
                    <small>${totalUSD.toFixed(2)}</small>
                  </div>
                  <div className="profit-estimate-card">
                    <span className="label">仕入原価合計</span>
                    <span className="value cost">¥{totalAcquisitionJPY.toLocaleString()}</span>
                  </div>
                  <div className={`profit-estimate-card ${totalProfitJPY >= 0 ? 'positive' : 'negative'}`}>
                    <span className="label">推定粗利益</span>
                    <span className="value">¥{totalProfitJPY.toLocaleString()}</span>
                    <small>利益率 {profitMargin.toFixed(1)}%</small>
                  </div>
                </div>

                <table className="profit-breakdown-table">
                  <thead>
                    <tr>
                      <th>商品</th>
                      <th>数量</th>
                      <th>販売額 (USD / JPY)</th>
                      <th>仕入原価 (JPY)</th>
                      <th>粗利益 (JPY)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {profitBreakdown.map(item => (
                      <tr key={item.id}>
                        <td>
                          <div className="profit-item-name">
                            <span>{item.name}</span>
                            <small>ランク: {item.rank}</small>
                          </div>
                        </td>
                        <td>{item.quantity}</td>
                        <td>
                          <div className="profit-cell">
                            <span>${item.saleUSD.toFixed(2)}</span>
                            <small>¥{item.saleJPY.toLocaleString()}</small>
                          </div>
                        </td>
                        <td>¥{item.acquisitionJPY.toLocaleString()}</td>
                        <td className={item.profitJPY >= 0 ? 'profit-positive' : 'profit-negative'}>
                          ¥{item.profitJPY.toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="button-group" style={{ marginTop: '20px' }}>
              <button className="btn-secondary" onClick={() => setSaleStep(2)}>
                ← 戻る
              </button>
              <button 
                className="btn-primary" 
                onClick={() => {
                  // 全ての商品に価格が設定されているかチェック
                  const allPriced = selectedInventoryItems.every(item => item.priceUSD > 0);
                  if (!allPriced) {
                    alert('全ての商品に価格を入力してください');
                    return;
                  }
                  setSaleStep(4);
                }}
                disabled={totalUSD === 0}
              >
                次へ →
              </button>
            </div>
          </div>
        </div>
      );
    }

    // ステップ4: 発送情報
    if (saleStep === 4) {
      return (
        <div className="sales-container">
          <div className="list-header">
            <h1>🌍 新規販売作成 - ステップ4: 発送情報</h1>
            <button className="back-btn" onClick={() => setSaleStep(3)}>
              ← 戻る
            </button>
          </div>
          
          <div className="step-indicator">
            <div className="step completed">1. バイヤー選択</div>
            <div className="step completed">2. 商品選択</div>
            <div className="step completed">3. 価格設定</div>
            <div className="step active">4. 発送情報</div>
            <div className="step">5. 確認</div>
          </div>

          <div className="shipping-info-section">
            <div className="shipping-info-row three-column">
              <div className="form-group">
                <label>発送方法 *</label>
                <select
                  value={shippingMethod}
                  onChange={(e) => setShippingMethod(e.target.value)}
                >
                  <option value="EMS">EMS</option>
                  <option value="DHL">DHL</option>
                  <option value="FedEx">FedEx</option>
                  <option value="その他">その他</option>
                </select>
              </div>

              <div className="form-group">
                <label>送料（USD）</label>
                <div className="price-input-wrapper">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={shippingFeeUSD || ''}
                    onChange={(e) => setShippingFeeUSD(parseFloat(e.target.value) || 0)}
                  />
                  {shippingFeeUSD > 0 && (
                    <div className="price-conversion-hint" style={{ marginTop: '6px' }}>
                      ≈ ¥{convertUSDToJPY(shippingFeeUSD).toLocaleString()}
                    </div>
                  )}
                </div>
              </div>

              <div className="form-group">
                <label>配送日数（任意）</label>
                <input
                  type="text"
                  value={deliveryDays}
                  onChange={(e) => setDeliveryDays(e.target.value)}
                  placeholder="例: 7-14日"
                />
              </div>
            </div>

            <div className="shipping-info-row two-column">
              <div className="form-group">
                <label>発送日 *</label>
                <input
                  type="date"
                  value={shippedDate}
                  onChange={(e) => setShippedDate(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label>追跡番号（任意）</label>
                <input
                  type="text"
                  value={trackingNumber}
                  onChange={(e) => setTrackingNumber(e.target.value)}
                  placeholder="例: EE123456789JP"
                />
              </div>
            </div>

            <div className="shipping-info-row two-column">
              <div className="form-group">
                <label>販売担当者 *</label>
                <select
                  value={salesStaffName}
                  onChange={(e) => setSalesStaffName(e.target.value)}
                  required
                >
                  <option value="">選択してください</option>
                  {staffMembers.map(staff => (
                    <option key={staff} value={staff}>{staff}</option>
                  ))}
                </select>
              </div>

              <div className="form-group notes-group">
                <label>備考（任意）</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows="3"
                  placeholder="特記事項があれば入力してください"
                />
              </div>
            </div>

            <div className="button-group" style={{ marginTop: '20px' }}>
              <button className="btn-secondary" onClick={() => setSaleStep(3)}>
                ← 戻る
              </button>
              <button 
                className="btn-primary" 
                onClick={() => {
                  if (!shippingMethod || !shippedDate || !salesStaffName) {
                    alert('必須項目（発送方法、発送日、販売担当者）を入力してください');
                    return;
                  }
                  setSaleStep(5);
                }}
              >
                次へ →
              </button>
            </div>
          </div>
        </div>
      );
    }

    // ステップ5: 確認・完了
    if (saleStep === 5) {
      const inventoryData = JSON.parse(localStorage.getItem('inventory') || '[]');
      const selectedInventoryItems = buildSelectedInventoryItems(inventoryData);

      const subtotalUSD = selectedInventoryItems.reduce((sum, item) => {
        return sum + (item.priceUSD * item.selectedQuantity);
      }, 0);
      const totalUSD = subtotalUSD + shippingFeeUSD;

      // 販売を完了する関数
      const handleCompleteSale = async () => {
        const confirmAction = window.confirm('販売を確定しますか？\n在庫が減算され、販売履歴に記録されます。\nこの操作は取り消せません。');
        if (!confirmAction) return;

        const safeParseArray = (key) => {
          try {
            return JSON.parse(localStorage.getItem(key) || '[]');
          } catch (error) {
            console.error(`${key} の読み込みに失敗しました:`, error);
            return [];
          }
        };

        const processSale = async () => {
          const inventoryData = safeParseArray('inventory');
          const salesHistory = safeParseArray('salesHistory');
          const salesLedger = safeParseArray('salesLedger');

          const saleId = `SALE-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
          const shippingFeeJPY = convertUSDToJPY(shippingFeeUSD);
          const saleRecord = {
            id: saleId,
            type: 'sales',
            soldDate: new Date().toISOString(),
            buyer: selectedBuyer,
            customer: selectedBuyer,
            items: [],
            salesChannel: 'overseas',
            shippingMethod: shippingMethod,
            shippingFeeUSD: shippingFeeUSD,
            shippingFeeJPY: shippingFeeJPY,
            deliveryDays: deliveryDays,
            shippedDate: shippedDate,
            trackingNumber: trackingNumber,
            salesStaffName: salesStaffName,
            notes: notes,
            summary: {
              totalAcquisitionCost: 0,
              totalSalesAmount: 0,
              totalSalesAmountUSD: 0,
              totalSalesAmountJPY: 0,
              totalProfit: 0,
              shippingFeeUSD: shippingFeeUSD,
              shippingFeeJPY: shippingFeeJPY
            }
          };

          const totalUnitsSelected = selectedInventoryItems.reduce((sum, product) => sum + (product.selectedQuantity || 0), 0) || 1;
          const shippingSharePerUnitUSD = shippingFeeUSD > 0 ? shippingFeeUSD / totalUnitsSelected : 0;
          const shippingSharePerUnitJPY = shippingSharePerUnitUSD > 0 ? convertUSDToJPY(shippingSharePerUnitUSD) : 0;

          for (const item of selectedInventoryItems) {
            const invIndex = inventoryData.findIndex(inv => inv.id === item.id);
            if (invIndex === -1) continue;

            const inv = inventoryData[invIndex];
            const acquisitionPrice = inv.acquisitionPrice || inv.buybackPrice || 0;
            const totalAcquisitionCost = acquisitionPrice * item.selectedQuantity;
            const salesPriceUSD = item.priceUSD;
            const salesPriceJPY = convertUSDToJPY(salesPriceUSD);
            const totalSalesAmountJPY = salesPriceJPY * item.selectedQuantity;
            const totalSalesAmountUSD = salesPriceUSD * item.selectedQuantity;
            const totalProfit = totalSalesAmountJPY - totalAcquisitionCost;

            saleRecord.items.push({
              inventoryId: inv.id,
              product: item.productType === 'software' 
                ? `${item.softwareName || ''} (${item.consoleLabel || ''})` 
                : `${item.consoleLabel || ''}${item.colorLabel ? ' - ' + item.colorLabel : ''}`,
              rank: inv.assessedRank,
              quantity: item.selectedQuantity,
              acquisitionPrice: acquisitionPrice,
              totalAcquisitionCost: totalAcquisitionCost,
              salesPriceUSD: salesPriceUSD,
              salesPriceJPY: salesPriceJPY,
              salesPrice: salesPriceJPY,
              totalSalesAmountUSD: totalSalesAmountUSD,
              totalSalesAmountJPY: totalSalesAmountJPY,
              totalSalesAmount: totalSalesAmountJPY,
              profit: salesPriceJPY - acquisitionPrice,
              totalProfit: totalProfit,
              source: inv.sourceType === 'customer' 
                ? { type: 'customer', name: inv.customer?.name || '不明', applicationNumber: inv.applicationNumber }
                : { type: 'supplier', name: inv.supplier?.name || '不明', invoiceNumber: inv.supplier?.invoiceNumber || '' }
            });

            saleRecord.summary.totalAcquisitionCost += totalAcquisitionCost;
            saleRecord.summary.totalSalesAmount += totalSalesAmountJPY;
            saleRecord.summary.totalSalesAmountUSD += totalSalesAmountUSD;
            saleRecord.summary.totalProfit += totalProfit;

            salesHistory.push({
              id: `${saleId}-${item.id}`,
              saleId: saleId,
              inventoryItemId: inv.id,
              productType: inv.productType,
              manufacturer: inv.manufacturer,
              manufacturerLabel: inv.manufacturerLabel,
              console: inv.console,
              consoleLabel: inv.consoleLabel,
              color: inv.color,
              colorLabel: inv.colorLabel,
              softwareName: inv.softwareName,
              assessedRank: inv.assessedRank,
              quantity: item.selectedQuantity,
              acquisitionPrice: acquisitionPrice,
              soldPriceUSD: salesPriceUSD,
              soldPrice: salesPriceJPY,
              profit: salesPriceJPY - acquisitionPrice,
              salesChannel: 'overseas',
              soldTo: selectedBuyer.name,
              buyer: selectedBuyer,
              soldAt: new Date().toISOString(),
              managementNumbers: (inv.managementNumbers || []).slice(0, item.selectedQuantity),
              shippingMethod: shippingMethod,
              shippingFeeUSD: shippingFeeUSD,
              trackingNumber: trackingNumber,
              salesStaffName: salesStaffName
            });

            try {
              const zaicoSaleData = {
                title: inv.title || inv.consoleLabel || inv.softwareName || 'ゲーム商品',
                inventoryId: inv.id,
                quantity: item.selectedQuantity,
                salePrice: salesPriceJPY,
                customerName: selectedBuyer.name,
                buyerName: selectedBuyer.name,
                salesChannel: '海外販売',
                shippingCountry: selectedBuyer.country || '海外',
                shippingFee: convertUSDToJPY(shippingFeeUSD),
                notes: `海外販売: ${saleId} | 査定ランク: ${inv.assessedRank || ''} | 担当者: ${salesStaffName}`
              };
              
              await createOutboundItemInZaico(zaicoSaleData);
              
              logSyncActivity('overseas_sale_create', 'success', {
                saleId: saleId,
                itemId: inv.id,
                customerName: selectedBuyer.name,
                soldPrice: salesPriceJPY,
                quantity: item.selectedQuantity
              });
            } catch (error) {
              logSyncActivity('overseas_sale_create', 'error', {
                saleId: saleId,
                itemId: inv.id,
                error: error.message
              });
              console.error('Zaico連携エラー:', error);
            }

            const beforeQuantity = inventoryData[invIndex].quantity;
            inventoryData[invIndex].quantity -= item.selectedQuantity;

            const inventoryHistory = safeParseArray('inventoryHistory');
            inventoryHistory.push({
              itemId: inv.id,
              type: 'sale',
              change: -item.selectedQuantity,
              beforeQuantity: beforeQuantity,
              afterQuantity: inventoryData[invIndex].quantity,
              date: new Date().toISOString(),
              performedBy: salesStaffName,
              reason: `海外販売（${saleId}）`,
              relatedTransaction: {
                type: 'overseas_sale',
                saleId: saleId,
                buyer: selectedBuyer.name
              }
            });
            localStorage.setItem('inventoryHistory', JSON.stringify(inventoryHistory));

            recordLedgerSale({
              inventoryItem: inv,
              saleId,
              quantity: item.selectedQuantity,
              priceJPY: totalSalesAmountJPY,
              priceUSD: totalSalesAmountUSD,
              shippingFeeJPY: shippingSharePerUnitJPY * item.selectedQuantity,
              shippingFeeUSD: shippingSharePerUnitUSD * item.selectedQuantity,
              eventDate: saleRecord.soldDate,
              buyer: selectedBuyer,
              salesChannel: 'overseas',
              staff: salesStaffName,
              managementNumbers: (inv.managementNumbers || []).slice(0, item.selectedQuantity),
              notes
            });
          }

          localStorage.setItem('salesHistory', JSON.stringify(salesHistory));

          saleRecord.summary.totalSalesAmountUSD = Math.round(saleRecord.summary.totalSalesAmountUSD * 100) / 100;
          saleRecord.summary.totalSalesAmountJPY = saleRecord.summary.totalSalesAmount;
          saleRecord.summary.totalSalesAmount = saleRecord.summary.totalSalesAmountJPY;
          saleRecord.summary.totalSalesAmountWithShippingUSD = saleRecord.summary.totalSalesAmountUSD + shippingFeeUSD;
          saleRecord.summary.totalSalesAmountWithShippingJPY = saleRecord.summary.totalSalesAmountJPY + shippingFeeJPY;

          const filteredInventory = inventoryData.filter(inv => inv.quantity > 0);
          localStorage.setItem('inventory', JSON.stringify(filteredInventory));

          salesLedger.push(saleRecord);
          localStorage.setItem('salesLedger', JSON.stringify(salesLedger));

          alert('販売が完了しました！');

          setViewMode('selection');
          setSaleStep(1);
          setSelectedBuyer(null);
          setSelectedItems([]);
          setSelectedInventories({});
          setItemPricesUSD({});
          setShippingFeeUSD(0);
          setDeliveryDays('');
          setTrackingNumber('');
          setSalesStaffName('');
          setNotes('');

          loadSalesHistory();
        };

        await processSale().catch(error => {
          console.error('販売処理中にエラーが発生しました:', error);
          alert('販売処理中にエラーが発生しました。もう一度お試しください。');
        });
      };

      return (
        <div className="sales-container">
          <div className="list-header">
            <h1>🌍 新規販売作成 - ステップ5: 確認</h1>
            <button className="back-btn" onClick={() => setSaleStep(4)}>
              ← 戻る
            </button>
          </div>
          
          <div className="step-indicator">
            <div className="step completed">1. バイヤー選択</div>
            <div className="step completed">2. 商品選択</div>
            <div className="step completed">3. 価格設定</div>
            <div className="step completed">4. 発送情報</div>
            <div className="step active">5. 確認</div>
          </div>

          <div className="confirmation-section">
            <div className="confirmation-card">
              <h3>バイヤー情報</h3>
              <div className="info-row">
                <span>名前:</span>
                <span>{selectedBuyer?.name}</span>
              </div>
              {selectedBuyer?.companyName && (
                <div className="info-row">
                  <span>会社名:</span>
                  <span>{selectedBuyer.companyName}</span>
                </div>
              )}
              <div className="info-row">
                <span>国:</span>
                <span>{selectedBuyer?.country}</span>
              </div>
              <div className="info-row">
                <span>メール:</span>
                <span>{selectedBuyer?.email}</span>
              </div>
            </div>

            <div className="confirmation-card">
              <h3>商品情報</h3>
              <table className="confirmation-table">
                <thead>
                  <tr>
                    <th>商品名</th>
                    <th>ランク</th>
                    <th>数量</th>
                    <th>単価（USD）</th>
                    <th>小計（USD）</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedInventoryItems.map(item => (
                    <tr key={item.id}>
                      <td>
                        {item.productType === 'software' 
                          ? `${item.softwareName || ''} (${item.consoleLabel || ''})`
                          : item.consoleLabel || ''}
                      </td>
                      <td>
                        <span className={`rank-badge rank-${(item.assessedRank || 'A').toLowerCase()}`}>
                          {item.assessedRank || 'A'}
                        </span>
                      </td>
                      <td>{item.selectedQuantity}</td>
                      <td>
                        <div>
                          <div>${item.priceUSD.toFixed(2)}</div>
                          <div className="price-conversion-hint" style={{ marginTop: '2px', fontSize: '11px' }}>
                            ≈ ¥{convertUSDToJPY(item.priceUSD).toLocaleString()}
                          </div>
                        </div>
                      </td>
                      <td>
                        <div>
                          <div>${(item.priceUSD * item.selectedQuantity).toFixed(2)}</div>
                          <div className="price-conversion-hint" style={{ marginTop: '2px', fontSize: '11px' }}>
                            ≈ ¥{convertUSDToJPY(item.priceUSD * item.selectedQuantity).toLocaleString()}
                          </div>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan="4" style={{ textAlign: 'right', fontWeight: 'bold' }}>小計（USD）:</td>
                    <td style={{ fontWeight: 'bold' }}>
                      <div>
                        <div>${subtotalUSD.toFixed(2)}</div>
                        {subtotalUSD > 0 && (
                          <div className="price-conversion-hint" style={{ marginTop: '4px', fontSize: '13px' }}>
                            ≈ ¥{convertUSDToJPY(subtotalUSD).toLocaleString()}
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                  <tr>
                    <td colSpan="4" style={{ textAlign: 'right', fontWeight: 'bold' }}>送料（USD）:</td>
                    <td style={{ fontWeight: 'bold' }}>
                      <div>
                        <div>${shippingFeeUSD.toFixed(2)}</div>
                        {shippingFeeUSD > 0 && (
                          <div className="price-conversion-hint" style={{ marginTop: '4px', fontSize: '13px' }}>
                            ≈ ¥{convertUSDToJPY(shippingFeeUSD).toLocaleString()}
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                  <tr style={{ borderTop: '2px solid #333', fontSize: '1.2em' }}>
                    <td colSpan="4" style={{ textAlign: 'right', fontWeight: 'bold' }}>合計（USD）:</td>
                    <td style={{ fontWeight: 'bold' }}>
                      <div>
                        <div>${totalUSD.toFixed(2)}</div>
                        {totalUSD > 0 && (
                          <div className="price-conversion-hint" style={{ marginTop: '4px', fontSize: '14px' }}>
                            ≈ ¥{convertUSDToJPY(totalUSD).toLocaleString()}
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            <div className="confirmation-card">
              <h3>発送情報</h3>
              <div className="info-row">
                <span>発送方法:</span>
                <span>{shippingMethod}</span>
              </div>
              <div className="info-row">
                <span>送料（USD）:</span>
                <span>
                  <div>${shippingFeeUSD.toFixed(2)}</div>
                  {shippingFeeUSD > 0 && (
                    <div className="price-conversion-hint" style={{ marginTop: '2px', fontSize: '12px' }}>
                      ≈ ¥{convertUSDToJPY(shippingFeeUSD).toLocaleString()}
                    </div>
                  )}
                </span>
              </div>
              {deliveryDays && (
                <div className="info-row">
                  <span>配送日数:</span>
                  <span>{deliveryDays}</span>
                </div>
              )}
              <div className="info-row">
                <span>発送日:</span>
                <span>{shippedDate}</span>
              </div>
              {trackingNumber && (
                <div className="info-row">
                  <span>追跡番号:</span>
                  <span>{trackingNumber}</span>
                </div>
              )}
              <div className="info-row">
                <span>販売担当者:</span>
                <span>{salesStaffName}</span>
              </div>
              {notes && (
                <div className="info-row">
                  <span>備考:</span>
                  <span>{notes}</span>
                </div>
              )}
            </div>

            <div className="button-group" style={{ marginTop: '30px' }}>
              <button className="btn-secondary" onClick={() => setSaleStep(4)}>
                ← 戻る
              </button>
              <button className="btn-primary" onClick={handleCompleteSale}>
                販売を確定
              </button>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="sales-container">
        <div className="list-header">
          <h1>新規販売作成</h1>
          <button className="back-btn" onClick={handleCancelNewSale}>
            ← キャンセル
          </button>
        </div>
        <p>不明なステップです...</p>
      </div>
    );
  }

  // === 販売履歴画面 ===
  if (viewMode === 'history') {
    return (
      <div className="sales-container">
        <div className="list-header">
          <h1>📦 販売履歴</h1>
          <button className="back-btn" onClick={() => setViewMode('selection')}>
            ← 戻る
          </button>
        </div>

        {salesHistory.length === 0 ? (
          <div className="empty-state">
            <p>販売履歴はありません</p>
          </div>
        ) : (
          <div className="request-list">
            {salesHistory.map((sale) => {
              const totalUSD = (sale.items || []).reduce((sum, item) => {
                const priceUSD = item.soldPriceUSD || convertJPYToUSD(item.soldPrice || 0);
                return sum + (priceUSD * item.quantity);
              }, 0);
              return (
                <div 
                  key={sale.id} 
                  className="request-card completed-card"
                  onClick={() => {
                    setSelectedSaleId(sale.id);
                    setViewMode('sale-detail');
                  }}
                >
                  <div className="card-header-row">
                    <div className="card-req-number">販売ID: {sale.id}</div>
                  </div>
                  <div className="card-customer">
                    👤 {sale.buyer?.name || sale.soldTo || '不明'}
                  </div>
                  <div className="card-items">
                    📦 {sale.items?.length || 0}商品
                  </div>
                  <div className="card-total">
                    💰 合計: ${totalUSD.toFixed(2)}
                  </div>
                  <div className="card-date">
                    📅 {new Date(sale.soldAt || sale.date).toLocaleDateString('ja-JP')}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // === 詳細画面 ===
  if (viewMode === 'detail' && currentReq) {
    const showLeftPanel = previousViewMode === 'pending';

    return (
      <div className="sales-container">
        <div className="detail-header">
          <h1>📋 リクエスト詳細</h1>
          <button className="back-btn-right" onClick={handleBackToList}>
            一覧に戻る →
          </button>
        </div>

        <div className={showLeftPanel ? 'sales-detail-layout' : 'sales-detail-only-layout'}>
          {/* 左パネル（進行中の場合のみ） */}
          {showLeftPanel && (
            <div className="sales-left-panel">
              <div className="sales-filter-card">
                <h3>🔍 ステータスフィルター</h3>
                <div className="sales-filter-buttons">
                  <button 
                    className={statusFilter === 'all' ? 'active' : ''}
                    onClick={() => setStatusFilter('all')}
                  >
                    全て表示
                  </button>
                  <button 
                    className={statusFilter === 'pending' ? 'active' : ''}
                    onClick={() => setStatusFilter('pending')}
                  >
                    見積もり待ち
                  </button>
                  <button 
                    className={statusFilter === 'quoted' ? 'active' : ''}
                    onClick={() => setStatusFilter('quoted')}
                  >
                    見積もり送信済
                  </button>
                  <button 
                    className={statusFilter === 'approved' ? 'active' : ''}
                    onClick={() => setStatusFilter('approved')}
                  >
                    承認済
                  </button>
                  <button 
                    className={statusFilter === 'payment_confirmed' ? 'active' : ''}
                    onClick={() => setStatusFilter('payment_confirmed')}
                  >
                    入金確認済
                  </button>
                </div>
              </div>

              <div className="sales-request-list-panel">
                <h3>📋 リクエスト一覧</h3>
                <div className="sales-mini-request-list">
                  {getFilteredRequests().map((req, idx) => {
                    return (
                      <div 
                        key={req.requestNumber}
                        className={`sales-mini-request-card ${req.requestNumber === selectedRequestNumber ? 'active' : ''}`}
                        onClick={() => setSelectedRequestNumber(req.requestNumber)}
                      >
                        <div className="sales-mini-req-number">{req.requestNumber}</div>
                        <div className="sales-mini-req-customer">{req.customer.name}</div>
                        <div className="sales-mini-req-status">
                          {getStatusEmoji(req.status)} {getStatusLabel(req.status)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* 右パネル（詳細） */}
          <div className={showLeftPanel ? 'sales-right-panel' : 'sales-detail-panel-full'}>
            {/* 進捗バー */}
            <div className="sales-progress-bar-section">
              <h3>📊 販売進捗状況</h3>
              <div className="sales-progress-steps">
                <div className={`sales-progress-step ${['pending', 'quoted', 'approved', 'payment_confirmed', 'shipped'].includes(currentReq.status) ? 'completed' : 'pending'}`}>
                  <div className="sales-step-circle">1</div>
                  <span className="sales-step-label">リクエスト受付</span>
                </div>
                <div className={`sales-progress-line ${['quoted', 'approved', 'payment_confirmed', 'shipped'].includes(currentReq.status) ? 'completed' : 'pending'}`}></div>
                <div className={`sales-progress-step ${['quoted', 'approved', 'payment_confirmed', 'shipped'].includes(currentReq.status) ? 'completed' : currentReq.status === 'pending' ? 'current' : 'pending'}`}>
                  <div className="sales-step-circle">2</div>
                  <span className="sales-step-label">見積もり作成</span>
                </div>
                <div className={`sales-progress-line ${['approved', 'payment_confirmed', 'shipped'].includes(currentReq.status) ? 'completed' : 'pending'}`}></div>
                <div className={`sales-progress-step ${['approved', 'payment_confirmed', 'shipped'].includes(currentReq.status) ? 'completed' : currentReq.status === 'quoted' ? 'current' : 'pending'}`}>
                  <div className="sales-step-circle">3</div>
                  <span className="sales-step-label">顧客承認</span>
                </div>
                <div className={`sales-progress-line ${['payment_confirmed', 'shipped'].includes(currentReq.status) ? 'completed' : 'pending'}`}></div>
                <div className={`sales-progress-step ${['payment_confirmed', 'shipped'].includes(currentReq.status) ? 'completed' : currentReq.status === 'approved' ? 'current' : 'pending'}`}>
                  <div className="sales-step-circle">4</div>
                  <span className="sales-step-label">入金確認</span>
                </div>
                <div className={`sales-progress-line ${currentReq.status === 'shipped' ? 'completed' : 'pending'}`}></div>
                <div className={`sales-progress-step ${currentReq.status === 'shipped' ? 'completed' : currentReq.status === 'payment_confirmed' ? 'current' : 'pending'}`}>
                  <div className="sales-step-circle">5</div>
                  <span className="sales-step-label">発送完了</span>
                </div>
              </div>
            </div>

            {/* リクエスト情報とお客様情報をコンパクトに */}
            <div className="sales-compact-info-section">
              <div className="sales-compact-info-left">
                <h3>📋 リクエスト情報</h3>
                <p><strong>リクエスト番号:</strong> {currentReq.requestNumber}</p>
                <p><strong>日時:</strong> {new Date(currentReq.date).toLocaleString('ja-JP')}</p>
                <p><strong>ステータス:</strong> <span className="sales-status-badge" data-status={currentReq.status}>
                  {getStatusEmoji(currentReq.status)} {getStatusLabel(currentReq.status)}
                </span></p>
              </div>
              <div className="sales-compact-info-right">
                <h3>👤 お客様情報</h3>
                <p><strong>{currentReq.customer.name}</strong> 様</p>
                <p>📧 {currentReq.customer.email}</p>
                {currentReq.customer.phone && <p>📞 {currentReq.customer.phone}</p>}
                <p>🌏 {currentReq.customer.country || 'Japan'}</p>
              </div>
            </div>

            {/* 商品リスト */}
            <div className="sales-detail-section">
              <h2>📦 リクエスト商品・見積もり</h2>
              <div className="sales-rating-table-wrapper">
                <table className="sales-rating-table">
                  <thead>
                    <tr>
                      <th>タイプ</th>
                      <th>メーカー・機種</th>
                      <th>カラー</th>
                      <th>ソフト名</th>
                      <th>状態</th>
                      <th>付属品</th>
                      <th>希望数</th>
                      <th>在庫数</th>
                      <th>販売単価（JPY）</th>
                      <th>小計（JPY）</th>
                    </tr>
                  </thead>
                  <tbody>
                    {currentReq.items.map(item => {
                      const stock = getAvailableStock(item);
                      return (
                        <tr key={item.id}>
                          <td>{item.productTypeLabel || item.productType}</td>
                          <td>
                            {item.productType === 'software' ? (
                              <>
                                <strong>{item.softwareName}</strong>
                                <br />
                                <small style={{color: '#95a5a6'}}>{item.manufacturerLabel} - {item.consoleLabel}</small>
                              </>
                            ) : (
                              `${item.manufacturerLabel} - ${item.consoleLabel}`
                            )}
                          </td>
                          <td>{item.colorLabel || '-'}</td>
                          <td>{item.softwareName || '-'}</td>
                          <td>{item.conditionLabel || '-'}</td>
                          <td>{item.packageTypeLabel || '-'}</td>
                          <td>{item.quantity}</td>
                          <td>
                            <span className={stock >= item.quantity ? 'sales-stock-ok' : 'sales-stock-low'}>
                              {stock}
                            </span>
                          </td>
                          <td>
                            {currentReq.status === 'pending' ? (
                              <div className="price-input-with-calc">
                              <input
                                type="number"
                                value={item.quotedPrice || ''}
                                onChange={(e) => handleItemUpdate(item.id, 'quotedPrice', parseInt(e.target.value) || 0)}
                                className="sales-price-input"
                                  step="100"
                                placeholder="0"
                              />
                                {priceCalculations[item.id] && (
                                  <div className="price-calc-info">
                                    <small style={{color: '#7f8c8d'}}>
                                      基準: ¥{priceCalculations[item.id].basePrice.toLocaleString()}
                                    </small>
                                    {priceCalculations[item.id].adjustment && (
                                      <small style={{color: '#f39c12', fontWeight: 'bold'}}>
                                        調整: {priceCalculations[item.id].adjustmentDetails}
                                      </small>
                                    )}
                                  </div>
                                )}
                                <small style={{display: 'block', color: '#7f8c8d', marginTop: '4px'}}>
                                  {item.quotedPrice ? `($${convertToUSD(item.quotedPrice).toFixed(2)})` : ''}
                                </small>
                              </div>
                            ) : (
                              <div>
                                ¥{(item.quotedPrice || 0).toLocaleString()}
                                <small style={{display: 'block', color: '#7f8c8d', marginTop: '4px'}}>
                                  (${convertToUSD(item.quotedPrice || 0).toFixed(2)})
                                </small>
                              </div>
                            )}
                          </td>
                          <td className="sales-subtotal">
                            <div>
                              ¥{((item.quotedPrice || 0) * item.quantity).toLocaleString()}
                              <small style={{display: 'block', color: '#7f8c8d', marginTop: '4px'}}>
                                (${convertToUSD((item.quotedPrice || 0) * item.quantity).toFixed(2)})
                              </small>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* 在庫選択セクション（入金確認済みの場合） */}
              {currentReq.status === 'payment_confirmed' && (
                <div className="inventory-selection-section">
                  <h2>📦 発送する在庫を選択</h2>
                  <p className="section-note">各商品に対応する在庫を選択してください。在庫はランク・仕入れ価格別に表示されます。</p>
                  
                  {currentReq.items.map(item => {
                    const inventoryList = getInventoryListForItem(item);
                    const selectedQty = getSelectedQuantity(item.id);
                    const needed = item.quantity;
                    const isComplete = selectedQty === needed;
                    const isOverSelected = selectedQty > needed;

                    return (
                      <div key={item.id} className="inventory-item-selection">
                        <div className="selection-header">
                          <h3>
                            {item.productType === 'software' 
                              ? `${item.softwareName} (${item.consoleLabel})` 
                              : `${item.consoleLabel}${item.colorLabel ? ' - ' + item.colorLabel : ''}`
                            }
                          </h3>
                          <div className="selection-progress">
                            <span className={isComplete ? 'complete' : isOverSelected ? 'over-selected' : 'incomplete'}>
                              選択済み: {selectedQty} / {needed}台 {isComplete && '✅'} {isOverSelected && '⚠️ 超過'}
                            </span>
                          </div>
                          <div className="weight-input-section">
                            <label>重量 (kg):</label>
                            <input
                              type="text"
                              inputMode="decimal"
                              placeholder="重量を入力 (例: 0.5)"
                              value={item.weight || ''}
                              onChange={(e) => {
                                const inputValue = e.target.value;
                                // 数字と小数点のみ許可
                                if (inputValue === '' || /^\d*\.?\d*$/.test(inputValue)) {
                                  handleItemUpdate(item.id, 'weight', inputValue);
                                }
                              }}
                              className="weight-input"
                            />
                          </div>
                        </div>

                        {inventoryList.length === 0 ? (
                          <div className="no-inventory-warning">
                            ⚠️ この商品の在庫がありません
                          </div>
                        ) : (
                          <div className="inventory-list">
                            {inventoryList.map(inv => {
                              const currentSelection = selectedInventories[item.id]?.find(s => s.invId === inv.id);
                              const selectedFromThis = currentSelection?.quantity || 0;
                              const price = inv.acquisitionPrice || inv.buybackPrice || 0;
                              const sourceName = inv.sourceType === 'customer' 
                                ? inv.customer?.name || '不明'
                                : inv.supplier?.name || '不明';

                              return (
                                <div key={inv.id} className="inventory-row-compact">
                                  <div className="inventory-info-compact">
                                    <span className={`rank-badge rank-${inv.assessedRank.toLowerCase()}`}>
                                      {inv.assessedRank}
                                    </span>
                                    <span className="inventory-source">
                                      {inv.sourceType === 'customer' ? '👤' : '🏢'} {sourceName}
                                    </span>
                                    <span className="inventory-price">¥{price.toLocaleString()}/台</span>
                                    <span className="inventory-stock">在庫:{inv.quantity}台</span>
                                    {inv.registeredDate && (
                                      <span className="inventory-date">
                                        仕入日:{new Date(inv.registeredDate).toLocaleDateString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit' })}
                                      </span>
                                    )}
                                  </div>
                                  <div className="inventory-select-compact">
                                    <input
                                      type="number"
                                      min="0"
                                      max={inv.quantity}
                                      value={selectedFromThis}
                              onWheel={(e) => e.currentTarget.blur()}
                                      onChange={(e) => handleSelectInventory(item.id, inv.id, parseInt(e.target.value) || 0, item.quantity)}
                                      className="quantity-input-compact"
                                      placeholder="0"
                                    />
                                    <span>/ {inv.quantity}台</span>
                                    {selectedFromThis > 0 && (
                                      <button
                                        className="btn-show-management-numbers-compact"
                                        onClick={() => handleShowManagementNumbers(inv, selectedFromThis, {
                                          productName: item.productType === 'software' 
                                            ? `${item.softwareName} (${item.consoleLabel})` 
                                            : `${item.consoleLabel}${item.colorLabel ? ' - ' + item.colorLabel : ''}`,
                                          sourceName: inv.sourceType === 'customer' 
                                            ? inv.customer?.name || '不明'
                                            : inv.supplier?.name || '不明'
                                        })}
                                      >
                                        🏷️
                                      </button>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {/* 利益計算表示 */}
                        {selectedQty > 0 && (
                          <div className="profit-display">
                            <div className="profit-row">
                              <span>販売価格:</span>
                              <span>¥{(item.quotedPrice * selectedQty).toLocaleString()}</span>
                            </div>
                            <div className="profit-row cost-item">
                              <span>送料（按分）:</span>
                              <span className="cost-value">
                                - ¥{Math.round((currentReq.shippingFee || 0) * (selectedQty / currentReq.items.reduce((sum, i) => sum + (getSelectedQuantity(i.id) || 0), 0))).toLocaleString()}
                              </span>
                            </div>
                            <div className="profit-row cost-item">
                              <span>仕入れ合計:</span>
                              <span className="cost-value">- ¥{calculateAcquisitionCost(item.id).toLocaleString()}</span>
                            </div>
                            <div className="profit-row profit-total">
                              <span>粗利益:</span>
                              <span className="profit-amount">
                                ¥{(
                                  (item.quotedPrice * selectedQty) - 
                                  Math.round((currentReq.shippingFee || 0) * (selectedQty / (currentReq.items.reduce((sum, i) => sum + (getSelectedQuantity(i.id) || 0), 0) || 1))) - 
                                  calculateAcquisitionCost(item.id)
                                ).toLocaleString()}
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* 備考 */}
              {currentReq.notes && (
                <div className="sales-detail-section">
                  <h2>📝 備考</h2>
                  <div className="sales-notes-display">{currentReq.notes}</div>
                </div>
              )}

              {/* 送料と配送期間の入力欄 */}
              {currentReq.status === 'pending' && (
                <>
                <div className="price-auto-calc-section">
                  <button className="btn-auto-calc-price" onClick={calculateAllPrices}>
                    💰 バイヤー別価格を一括計算
                  </button>
                  <small className="auto-calc-hint">
                    基準価格とバイヤー別調整を適用して、全商品の価格を自動計算します
                  </small>
                </div>
                
                <div className="sales-shipping-quote-section">
                  <div className="sales-quote-row">
                    <div className="sales-quote-item">
                      <label htmlFor="shippingFee">📦 送料（JPY）</label>
                      <input
                        type="number"
                        id="shippingFee"
                        className="sales-shipping-input"
                        value={tempShippingFee || ''}
                        onChange={(e) => setTempShippingFee(parseInt(e.target.value) || 0)}
                        step="100"
                        placeholder="7500"
                      />
                      <small style={{color: '#7f8c8d', marginTop: '5px', display: 'block'}}>
                        ${convertToUSD(tempShippingFee || 0).toFixed(2)} / 参考: 小型 ¥4500-7500, 大型 ¥12000-22500
                      </small>
                    </div>
                    <div className="sales-quote-item">
                      <label htmlFor="deliveryDays">📅 配送期間 *</label>
                      <input
                        type="text"
                        id="deliveryDays"
                        className="sales-shipping-input"
                        value={tempDeliveryDays}
                        onChange={(e) => setTempDeliveryDays(e.target.value)}
                        placeholder="7-10"
                      />
                      <small style={{color: '#7f8c8d', marginTop: '5px', display: 'block'}}>
                        例: 7-10, 10-14（日数）
                      </small>
                    </div>
                  </div>
                </div>
                </>
              )}

              {/* 合計カード（小計 + 送料 = 合計）- 入金確認済み時は非表示 */}
              {currentReq.status !== 'payment_confirmed' && (
              <div className="sales-total-card">
                <div className="sales-total-row">
                  <span className="sales-total-label">小計</span>
                  <span className="sales-total-value">
                    ¥{calculateTotal().toLocaleString()}
                    <small style={{display: 'block', fontSize: '0.85em', color: '#7f8c8d', marginTop: '4px'}}>
                      (${convertToUSD(calculateTotal()).toFixed(2)})
                    </small>
                  </span>
                </div>
                
                {/* 送料表示（見積もり中は入力値、確定後は保存値） */}
                {((currentReq.status === 'pending' && tempShippingFee > 0) || (currentReq.status !== 'pending' && currentReq.shippingFee)) && (
                  <div className="sales-total-row">
                    <span className="sales-total-label">送料</span>
                    <span className="sales-total-value">
                      ¥{(currentReq.status === 'pending' ? tempShippingFee : currentReq.shippingFee).toLocaleString()}
                      <small style={{display: 'block', fontSize: '0.85em', color: '#7f8c8d', marginTop: '4px'}}>
                        (${convertToUSD(currentReq.status === 'pending' ? tempShippingFee : currentReq.shippingFee).toFixed(2)})
                      </small>
                    </span>
                  </div>
                )}
                
                {/* 配送期間表示 */}
                {((currentReq.status === 'pending' && tempDeliveryDays) || (currentReq.status !== 'pending' && currentReq.deliveryDays)) && (
                  <div className="sales-total-row">
                    <span className="sales-total-label">配送期間</span>
                    <span className="sales-total-value">
                      {currentReq.status === 'pending' ? tempDeliveryDays : currentReq.deliveryDays} 日
                    </span>
                  </div>
                )}
                
                {/* 合計金額 */}
                <div className="sales-total-row sales-grand-total">
                  <span className="sales-total-label">合計金額</span>
                  <span className="sales-total-value">
                    ¥{(calculateTotal() + (currentReq.status === 'pending' ? tempShippingFee : (currentReq.shippingFee || 0))).toLocaleString()}
                    <small style={{display: 'block', fontSize: '0.85em', color: '#7f8c8d', marginTop: '4px'}}>
                      (${convertToUSD(calculateTotal() + (currentReq.status === 'pending' ? tempShippingFee : (currentReq.shippingFee || 0))).toFixed(2)})
                    </small>
                  </span>
                </div>
              </div>
              )}
            </div>

            {currentReq.status === 'shipped' && (
              <div className="sales-completed-message">
                <p>✅ 販売処理が完了しました。見積書を印刷できます。</p>
              </div>
            )}

            {/* 販売担当者選択 */}
            {currentReq.status === 'pending' && (
              <div className="sales-staff-selection-section">
                <label htmlFor="sales-staff-select">👤 販売担当者 *</label>
                <select
                  id="sales-staff-select"
                  value={salesStaffName}
                  onChange={(e) => setSalesStaffName(e.target.value)}
                  className="sales-staff-select"
                >
                  <option value="">選択してください</option>
                  {staffMembers.map(member => (
                    <option key={member} value={member}>{member}</option>
                  ))}
                </select>
              </div>
            )}

            {/* 担当者表示（見積もり送信後） */}
            {currentReq.salesStaffName && currentReq.status !== 'pending' && (
              <div className="sales-staff-display">
                <span className="staff-label">👤 販売担当者:</span>
                <span className="staff-name">{getJapaneseName(currentReq.salesStaffName)}</span>
              </div>
            )}

            {/* アクションボタン */}
            <div className="sales-action-buttons">
              {currentReq.status === 'pending' && (
                <>
                  <button className="sales-print-button" onClick={handlePrint}>🖨️ 見積書印刷</button>
                  <button className="sales-confirm-button" onClick={handleConfirmQuote}>
                    ✅ 見積もりを確定
                  </button>
                </>
              )}
              
              {currentReq.status === 'quoted' && (
                <>
                  <button className="sales-print-button" onClick={handlePrint}>🖨️ 見積書印刷</button>
                  <button className="sales-waiting-button" disabled>
                    ⏳ お客様の承認待ち
                  </button>
                </>
              )}
              
              {currentReq.status === 'approved' && (
                <>
                  <button className="sales-print-button" onClick={handlePrint}>🖨️ 見積書印刷</button>
                  <button className="sales-confirm-button" onClick={() => {
                    if (!window.confirm('入金確認を記録しますか？')) return;
                    updateStatus('payment_confirmed');
                    setShowShippingInfo(true);
                    alert('入金確認済みに更新しました。発送準備を行ってください。');
                  }}>
                    💳 入金確認
                  </button>
                </>
              )}
              
              
            </div>

            {/* 発送情報（一番下に独立配置） */}
            {['payment_confirmed', 'shipped'].includes(currentReq.status) && (
              <div className="sales-detail-section sales-shipping-section-bottom">
                <div className="sales-collapsible-header" onClick={() => setShowShippingInfo(!showShippingInfo)}>
                  <h2>📦 発送情報</h2>
                  <span className="sales-collapse-icon">{showShippingInfo ? '▼' : '▶'}</span>
                </div>
                
                {showShippingInfo && (
                  <div className="sales-shipping-layout">
                    <div className="sales-shipping-info-left">
                      <p><strong>発送先住所:</strong> {currentReq.shippingAddress || '確認中'}</p>
                      <p><strong>発送方法:</strong> {currentReq.shippingMethod || 'EMS'}</p>
                      {currentReq.trackingNumber && (
                        <p><strong>✅ 追跡番号:</strong> {currentReq.trackingNumber}</p>
                      )}
                      {currentReq.shippedDate && (
                        <p><strong>✅ 発送日:</strong> {currentReq.shippedDate}</p>
                      )}
                    </div>

                    <div className="sales-shipping-actions">
                      {currentReq.status === 'payment_confirmed' && (
                        <>
                          <div className="sales-shipping-inputs-row" style={{ marginLeft: '-30px', maxWidth: '90%' }}>
                            <div className="sales-form-group">
                              <label>📅 発送日</label>
                              <input
                                type="date"
                                id="shippedDate"
                                defaultValue={getTodayJST()}
                              />
                            </div>
                            <div className="sales-form-group" style={{ flex: '1.8' }}>
                              <label>🏷️ 追跡番号</label>
                              <input
                                type="text"
                                id="trackingNumber"
                                placeholder="追跡番号を入力"
                                style={{ minWidth: '200px', maxWidth: '280px' }}
                              />
                            </div>
                          </div>
                          <div className="sales-shipping-buttons" style={{ marginTop: '20px', justifyContent: 'flex-start', marginLeft: '-30px' }}>
                            <button className="sales-action-btn sales-btn-secondary" onClick={handlePrintInvoice}>
                              📄 インボイス印刷
                            </button>
                            <button onClick={() => {
                              const date = document.getElementById('shippedDate').value;
                              const tracking = document.getElementById('trackingNumber').value;
                              
                              // 在庫選択チェック
                              const allSelected = currentReq.items.every(item => {
                                const selected = getSelectedQuantity(item.id);
                                return selected === item.quantity;
                              });

                              if (!allSelected) {
                                alert('全ての商品の在庫を選択してから発送完了にしてください');
                                return;
                              }

                              handleCompleteSale(date, tracking);
                            }} className="sales-action-btn sales-btn-primary">
                              📦 発送完了にする
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* 管理番号表示モーダル */}
        {showManagementNumberModal && (
          <div className="modal-overlay" onClick={() => setShowManagementNumberModal(false)}>
            <div className="management-number-modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2>🏷️ 出荷される管理番号</h2>
                <button className="modal-close-btn" onClick={() => setShowManagementNumberModal(false)}>×</button>
              </div>
              
              <div className="modal-body">
                {currentItemInfo && (
                  <div className="modal-item-info">
                    <p><strong>商品名:</strong> {currentItemInfo.productName}</p>
                    <p><strong>仕入れ元:</strong> {currentItemInfo.sourceName}</p>
                    <p><strong>ランク:</strong> <span className={`rank-badge rank-${currentItemInfo.rank.toLowerCase()}`}>{currentItemInfo.rank}</span></p>
                    <p><strong>出荷数:</strong> {currentItemInfo.selectedQuantity}個（在庫: {currentItemInfo.totalStock}個）</p>
                  </div>
                )}
                
                <div className="management-numbers-list-modal">
                  <h3>管理番号一覧 ({currentManagementNumbers.length}個)</h3>
                  {currentManagementNumbers.length > 0 ? (
                    <div className="management-numbers-grid-modal">
                      {currentManagementNumbers.map((number, idx) => (
                        <div key={idx} className="management-number-item-modal">
                          <span className="number-index-modal">{idx + 1}.</span>
                          <span className="number-value-modal">{number}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="no-numbers">管理番号が登録されていません</p>
                  )}
                </div>
              </div>
              
              <div className="modal-footer">
                <button className="btn-close-modal" onClick={() => setShowManagementNumberModal(false)}>
                  閉じる
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 印刷用テンプレート */}
        <div className="print-only estimate-sheet">
          <div className="estimate-header">
            <div className="estimate-left">
              <h1 className="estimate-title">Sales Quotation</h1>
              <div className="estimate-meta">
                <p>Quote No.: {currentReq.requestNumber}</p>
                <p>Issue Date: {getTodayJST()}</p>
              </div>
            </div>
            <div className="company-info-right">
              <h2>{companyInfo.nameEn}</h2>
              <p>{companyInfo.addressEn}</p>
              <p>{companyInfo.phoneEn}</p>
              <p>{companyInfo.email}</p>
              <p className="license">{companyInfo.licenseEn}</p>
              {(currentReq.salesStaffName || salesStaffName) && (
                <p><strong>Contact Person:</strong> {getEnglishName(currentReq.salesStaffName || salesStaffName)}</p>
              )}
            </div>
          </div>

          <div className="customer-section">
            <h3>Customer Information</h3>
            <div className="customer-details">
              <p><strong>{currentReq.customer.name}</strong></p>
              <p>Email: {currentReq.customer.email} &nbsp;&nbsp; Tel: {currentReq.customer.phone || 'N/A'}</p>
              {currentReq.customer.country && <p>Country: {currentReq.customer.country}</p>}
            </div>
          </div>

          <table className="estimate-table">
            <thead>
              <tr>
                <th>Item Name</th>
                <th>Color</th>
                <th>Condition</th>
                <th>Package</th>
                <th>Qty</th>
                <th>Unit Price (USD)</th>
                <th>Amount (USD)</th>
              </tr>
            </thead>
            <tbody>
              {currentReq.items.map((item, idx) => (
                <tr key={idx}>
                  <td>
                    {item.productType === 'software' 
                      ? `${item.softwareName} (${item.consoleLabel})` 
                      : `${item.manufacturerLabel} ${item.consoleLabel}`
                    }
                  </td>
                  <td>{item.colorLabel || '-'}</td>
                  <td>{item.conditionLabel || '-'}</td>
                  <td>{item.packageTypeLabel || '-'}</td>
                  <td className="center">{item.quantity}</td>
                  <td className="right">${convertToUSD(item.quotedPrice || 0).toFixed(2)}</td>
                  <td className="right">${convertToUSD((item.quotedPrice || 0) * item.quantity).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="estimate-total">
            <div className="total-row">
              <span className="total-label-print">Subtotal</span>
              <span className="total-amount-print">${convertToUSD(calculateTotal()).toFixed(2)}</span>
            </div>
            {getPrintShippingFee() > 0 && (
              <div className="total-row">
                <span className="total-label-print">Shipping Fee</span>
                <span className="total-amount-print">${convertToUSD(getPrintShippingFee()).toFixed(2)}</span>
              </div>
            )}
            {getPrintDeliveryDays() && (
              <div className="total-row">
                <span className="total-label-print">Estimated Delivery</span>
                <span className="total-amount-print">{getPrintDeliveryDays()} days</span>
              </div>
            )}
            <div className="total-row" style={{borderTop: '2px solid #333', marginTop: '10px', paddingTop: '10px', fontWeight: 'bold', fontSize: '1.2em'}}>
              <span className="total-label-print">Total Amount</span>
              <span className="total-amount-print">${convertToUSD(calculateTotal() + getPrintShippingFee()).toFixed(2)}</span>
            </div>
          </div>

          {currentReq.notes && (
            <div className="estimate-notes">
              <h4>Notes</h4>
              <p>{currentReq.notes}</p>
            </div>
          )}

          <div className="estimate-notes" style={{marginTop: '20px'}}>
            <p style={{fontSize: '0.9em'}}>
              * All prices are in US Dollars (USD)<br/>
              * Payment terms: Wire transfer in advance<br/>
              * Items will be shipped after payment confirmation
            </p>
          </div>
        </div>

        {/* インボイス印刷用テンプレート */}
        <div className="print-only invoice-sheet" style={{display: 'none'}}>
          <div className="invoice-header">
            <div className="invoice-left">
              <h1 className="invoice-title">INVOICE</h1>
              <div className="invoice-meta">
                <p>Invoice No.: {currentReq.requestNumber}</p>
                <p>Invoice Date: {getTodayJST()}</p>
                <p>Payment Status: <strong>Paid</strong></p>
              </div>
            </div>
            <div className="company-info-right">
              <h2>{companyInfo.nameEn}</h2>
              <p>{companyInfo.addressEn}</p>
              <p>{companyInfo.phoneEn}</p>
              <p>{companyInfo.email}</p>
              <p className="license">{companyInfo.licenseEn}</p>
              {(currentReq.salesStaffName || salesStaffName) && (
                <p><strong>Contact Person:</strong> {getEnglishName(currentReq.salesStaffName || salesStaffName)}</p>
              )}
            </div>
          </div>

          <div className="customer-section">
            <h3>Customer Information</h3>
            <div className="customer-details">
              <p><strong>{currentReq.customer.name}</strong></p>
              <p>Email: {currentReq.customer.email} &nbsp;&nbsp; Tel: {currentReq.customer.phone || 'N/A'}</p>
              {currentReq.customer.country && <p>Country: {currentReq.customer.country}</p>}
            </div>
          </div>

          <div className="shipping-section">
            <h3>Shipping Information</h3>
            <div className="shipping-details">
              {(() => {
                const shippingInfo = getInvoiceShippingInfo();
                return (
                  <p>
                    <strong>Shipping Method:</strong> EMS &nbsp;&nbsp;
                    <strong>Shipping Date:</strong> {shippingInfo.shippedDate}
                    {shippingInfo.trackingNumber && (
                      <> &nbsp;&nbsp; <strong>Tracking Number:</strong> {shippingInfo.trackingNumber}</>
                    )}
                  </p>
                );
              })()}
            </div>
          </div>

          <table className="invoice-table">
            <thead>
              <tr>
                <th>Item Name</th>
                <th>Country</th>
                <th>Weight (kg)</th>
                <th>Qty</th>
                <th>Unit Price (USD)</th>
                <th>Amount (USD)</th>
              </tr>
            </thead>
            <tbody>
              {currentReq.items.map((item, idx) => (
                <tr key={idx}>
                  <td>
                    {item.productType === 'software' 
                      ? `${item.softwareName} (${item.consoleLabel})` 
                      : `${item.manufacturerLabel} ${item.consoleLabel}`
                    }
                  </td>
                  <td className="center">{getCountryOfOrigin(item)}</td>
                  <td className="center">{item.weight || 0}</td>
                  <td className="center">{item.quantity}</td>
                  <td className="right">${convertToUSD(item.quotedPrice || 0).toFixed(2)}</td>
                  <td className="right">${convertToUSD((item.quotedPrice || 0) * item.quantity).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="invoice-total">
            <div className="total-row">
              <span className="total-label-print">Subtotal</span>
              <span className="total-amount-print">${convertToUSD(calculateTotal()).toFixed(2)}</span>
            </div>
            {getPrintShippingFee() > 0 && (
              <div className="total-row">
                <span className="total-label-print">Shipping Fee</span>
                <span className="total-amount-print">${convertToUSD(getPrintShippingFee()).toFixed(2)}</span>
              </div>
            )}
            <div className="total-row">
              <span className="total-label-print">Total Weight</span>
              <span className="total-amount-print">{calculateTotalWeight()}kg</span>
            </div>
            <div className="total-row" style={{borderTop: '2px solid #333', marginTop: '10px', paddingTop: '10px', fontWeight: 'bold', fontSize: '1.2em'}}>
              <span className="total-label-print">Total Amount</span>
              <span className="total-amount-print">${convertToUSD(calculateTotal() + getPrintShippingFee()).toFixed(2)}</span>
            </div>
          </div>

          <div className="invoice-notes" style={{marginTop: '20px'}}>
            <p style={{fontSize: '0.9em'}}>
              * Thank you for your business
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="sales-container">
      <h1>販売管理</h1>
      <p>データを読み込んでいます...</p>
    </div>
  );
};

export default Sales;
