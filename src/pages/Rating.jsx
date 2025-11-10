import React, { useState, useEffect } from 'react';
import { manufacturers, colors, conditions, accessories } from '../data/gameConsoles';
import { getAllConsoles } from '../utils/productMaster';
import { generateManagementNumber, generateProductCode } from '../utils/productCodeGenerator';
import { getBuybackBasePrice } from '../utils/priceCalculator';
import { createInventoryInZaico, createPurchaseInZaico, logSyncActivity } from '../utils/zaicoApi';
import { recordLedgerPurchase } from '../utils/ledgerRecords';
import './Rating.css';

// 付属品を短く表示する関数
const getShortAccessoriesLabel = (accessoriesValue) => {
  const shortLabels = {
    'complete': '◎完備',
    'no-box': '箱×',
    'no-manual': '書×',
    'partial': '一部×',
    'body-only': '本体のみ'
  };
  return shortLabels[accessoriesValue] || '-';
};

// 担当者リスト
const staffMembers = [
  '佐藤 花子（Sato Hanako）',
  '鈴木 一郎（Suzuki Ichiro）',
  '田中 美咲（Tanaka Misaki）',
  '高橋 健太（Takahashi Kenta）'
];

const Rating = () => {
  const [viewMode, setViewMode] = useState('selection'); // 'selection', 'ongoing', 'completed', 'detail'
  const [previousViewMode, setPreviousViewMode] = useState(null); // どこから来たかを記憶
  const [selectedApplication, setSelectedApplication] = useState(null);
  const [applications, setApplications] = useState([]);
  const [statusFilter, setStatusFilter] = useState('all');
  const [assessorName, setAssessorName] = useState(''); // 査定担当者
  const [allGameConsoles, setAllGameConsoles] = useState({});
  const [showNotesFor, setShowNotesFor] = useState({}); // どの商品の備考を表示するか {itemId: true/false}
  
  // 商品追加用（カンタン見積もりの場合）
  const [showAddItem, setShowAddItem] = useState(false);
  const [showShippingInfo, setShowShippingInfo] = useState(true);
  const [printMode, setPrintMode] = useState('estimate');
  
  // 在庫登録確認モーダル
  const [showInventoryModal, setShowInventoryModal] = useState(false);
  const [generatedManagementNumbers, setGeneratedManagementNumbers] = useState({});
  const [editingManagementNumbers, setEditingManagementNumbers] = useState({}); // 編集中の管理番号 {itemId: true/false}
  const [newItem, setNewItem] = useState({
    productType: 'console',
    manufacturer: '',
    console: '',
    color: '',
    softwareName: '',
    condition: '',
    quantity: 1,
    assessedRank: '',
    buybackPrice: 0
  });
  const [availableConsoles, setAvailableConsoles] = useState([]);

  // 日本時間の今日の日付を取得
  const getTodayJST = () => {
    const now = new Date();
    const jstOffset = 9 * 60; // JST is UTC+9
    const jstTime = new Date(now.getTime() + jstOffset * 60 * 1000);
    return jstTime.toISOString().split('T')[0];
  };

  // 会社情報
  const companyInfo = {
    name: '株式会社ゲーム買取センター',
    postalCode: '〒160-0022',
    address: '東京都新宿区新宿3-1-1',
    phone: 'TEL: 03-1234-5678',
    email: 'info@game-kaitori.jp',
    license: '古物商許可証：東京都公安委員会 第123456789号'
  };

  // 見積書印刷
  const handlePrint = () => {
    if (!currentApp || !currentApp.items || currentApp.items.length === 0) {
      alert('印刷する商品がありません');
      return;
    }

    setPrintMode('estimate');
    setTimeout(() => window.print(), 100);
  };

  // localStorageから申込データを取得
  const loadApplications = () => {
    const storedApplications = localStorage.getItem('allApplications');
    if (storedApplications) {
      const apps = JSON.parse(storedApplications);
      setApplications(apps);
    } else {
      // デモデータなし、空配列で初期化
      setApplications([]);
    }
  };

  useEffect(() => {
    loadApplications();
    setAllGameConsoles(getAllConsoles());
  }, []);

  // ページがアクティブになった時にデータを再読み込み（価格入力中は完全に除外）
  useEffect(() => {
    let isPriceInputActive = false;
    let lastPriceUpdateTime = 0;

    const handleFocus = () => {
      // 価格入力フィールドにフォーカスがある場合は更新しない
      const activeElement = document.activeElement;
      if (activeElement && activeElement.classList.contains('price-input')) {
        isPriceInputActive = true;
        return;
      }
      
      // 価格入力から離れた場合
      if (isPriceInputActive) {
        // 価格更新から3秒以内の場合は更新しない
        const now = Date.now();
        if (window.lastPriceUpdateTime && (now - window.lastPriceUpdateTime < 3000)) {
          return;
        }
        isPriceInputActive = false;
      }
      
      loadApplications();
    };

    const handleStorageChange = (e) => {
      if (e.key === 'allApplications') {
        // 価格入力中は完全に無視
        if (isPriceInputActive) {
          return;
        }
        loadApplications();
      }
    };

    window.addEventListener('focus', handleFocus);
    window.addEventListener('storage', handleStorageChange);

    return () => {
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('storage', handleStorageChange);
    };
  }, []);

  const currentApp = selectedApplication !== null ? applications[selectedApplication] : null;

  // メーカー選択時に機種リストを更新
  const handleManufacturerChange = (manufacturerValue) => {
    setNewItem({
      ...newItem,
      manufacturer: manufacturerValue,
      console: ''
    });
    
    if (manufacturerValue && allGameConsoles[manufacturerValue]) {
      setAvailableConsoles(allGameConsoles[manufacturerValue]);
    } else {
      setAvailableConsoles([]);
    }
  };

  // 商品を追加（カンタン見積もりの場合）
  const handleAddItem = () => {
    if (!newItem.manufacturer || !newItem.console) {
      alert('必須項目を入力してください');
      return;
    }

    if (newItem.productType === 'software' && !newItem.softwareName) {
      alert('ソフト名を入力してください');
      return;
    }

    const manufacturerLabel = manufacturers.find(m => m.value === newItem.manufacturer)?.label;
    const consoleLabel = availableConsoles.find(c => c.value === newItem.console)?.label;
    const conditionLabel = conditions.find(c => c.value === newItem.condition)?.label;
    const colorLabel = newItem.color || '';

    const itemToAdd = {
      id: Date.now(),
      ...newItem,
      productTypeLabel: newItem.productType === 'console' ? 'ゲーム本体' : 'ゲームソフト',
      manufacturerLabel,
      consoleLabel,
      colorLabel,
      conditionLabel
    };

    const updatedApplications = applications.map((app, index) => {
      if (index === selectedApplication) {
        return {
          ...app,
          items: [...(app.items || []), itemToAdd]
        };
      }
      return app;
    });

    setApplications(updatedApplications);
    localStorage.setItem('allApplications', JSON.stringify(updatedApplications));

    setNewItem({
      productType: 'console',
      manufacturer: '',
      console: '',
      color: '',
      softwareName: '',
      condition: '',
      quantity: 1,
      assessedRank: '',
      buybackPrice: 0
    });
    setAvailableConsoles([]);
    setShowAddItem(false);
  };

  // 査定ランク変更（手動価格入力済みの場合は価格を保持）
  const handleRankChange = (itemId, rank) => {
    const updatedApplications = applications.map((app, index) => {
      if (index === selectedApplication) {
        return {
          ...app,
          items: app.items.map(item => {
            if (item.id === itemId) {
              // 手動で価格が入力済みの場合は価格を保持
              const hasManualPrice = item.buybackPrice && item.buybackPrice > 0;
              
              if (hasManualPrice) {
                // 手動価格がある場合は価格を変更せず、ランクのみ更新
                return { 
                  ...item, 
                  assessedRank: rank
                };
              } else {
                // 手動価格がない場合のみ基準価格を自動設定
                const productCode = generateProductCode(item.manufacturer, item.console, item.productType);
                const basePrice = getBuybackBasePrice(productCode, rank);
                
                return { 
                  ...item, 
                  assessedRank: rank,
                  buybackPrice: basePrice > 0 ? basePrice : (item.buybackPrice || 0)
                };
              }
            }
            return item;
          })
        };
      }
      return app;
    });

    setApplications(updatedApplications);
    localStorage.setItem('allApplications', JSON.stringify(updatedApplications));
  };

  // 買取単価変更（即座に保存 + タイムスタンプ記録）
  const handlePriceChange = (itemId, price) => {
    const updatedApplications = applications.map((app, index) => {
      if (index === selectedApplication) {
        return {
          ...app,
          items: app.items.map(item =>
            item.id === itemId ? { ...item, buybackPrice: parseInt(price) || 0 } : item
          )
        };
      }
      return app;
    });

    setApplications(updatedApplications);
    
    // 即座にlocalStorageを更新
    localStorage.setItem('allApplications', JSON.stringify(updatedApplications));
    
    // 価格更新のタイムスタンプを記録
    window.lastPriceUpdateTime = Date.now();
  };

  // 商品の備考変更
  const handleNotesChange = (itemId, notes) => {
    const updatedApplications = applications.map((app, index) => {
      if (index === selectedApplication) {
        return {
          ...app,
          items: app.items.map(item =>
            item.id === itemId ? { ...item, itemNotes: notes } : item
          )
        };
      }
      return app;
    });

    setApplications(updatedApplications);
    localStorage.setItem('allApplications', JSON.stringify(updatedApplications));
  };

  // 商品削除
  const handleRemoveItem = (itemId) => {
    if (!window.confirm('この商品を削除しますか？')) {
      return;
    }

    const updatedApplications = applications.map((app, index) => {
      if (index === selectedApplication) {
        return {
          ...app,
          items: app.items.filter(item => item.id !== itemId)
        };
      }
      return app;
    });

    setApplications(updatedApplications);
    localStorage.setItem('allApplications', JSON.stringify(updatedApplications));
  };

  // 商品を分割（1台ずつに分ける）
  const handleSplitItem = (itemId) => {
    const updatedApplications = applications.map((app, index) => {
      if (index === selectedApplication) {
        const targetItem = app.items.find(item => item.id === itemId);
        if (!targetItem || targetItem.quantity <= 1) return app;

        // 元の商品を削除
        const filteredItems = app.items.filter(item => item.id !== itemId);
        
        // 数量分の新しい商品を作成（1台ずつ）
        const splitItems = [];
        for (let i = 0; i < targetItem.quantity; i++) {
          splitItems.push({
            ...targetItem,
            id: `${targetItem.id}-split-${i}-${Date.now()}`,
            quantity: 1,
            assessedRank: '', // 個別に査定
            buybackPrice: 0,   // 個別に価格設定
            isSplit: true,     // 分割された商品であることを記録
            originalId: targetItem.id // 元の商品ID
          });
        }

        return {
          ...app,
          items: [...filteredItems, ...splitItems]
        };
      }
      return app;
    });

    setApplications(updatedApplications);
    localStorage.setItem('allApplications', JSON.stringify(updatedApplications));
    alert(`商品を${currentApp.items.find(item => item.id === itemId).quantity}台に分割しました。それぞれ個別に査定してください。`);
  };

  const calculateTotal = () => {
    if (!currentApp || !currentApp.items) return 0;
    const itemsTotal = currentApp.items.reduce((sum, item) => sum + ((item.buybackPrice || 0) * item.quantity), 0);
    return itemsTotal;
  };

  // ステータス変更
  const updateStatus = (newStatus, additionalData = {}) => {
    const updatedApplications = applications.map((app, index) => {
      if (index === selectedApplication) {
        return { ...app, status: newStatus, ...additionalData };
      }
      return app;
    });

    setApplications(updatedApplications);
    localStorage.setItem('allApplications', JSON.stringify(updatedApplications));
  };


  const handleConfirmRating = () => {
    if (!currentApp.items || currentApp.items.length === 0) {
      alert('商品が登録されていません');
      return;
    }

    // 全商品が査定済みかチェック
    const allAssessed = currentApp.items.every(item => item.assessedRank && item.buybackPrice > 0);
    if (!allAssessed) {
      alert('全ての商品に査定ランクと買取単価を入力してください');
      return;
    }

    // 担当者名のチェック
    if (!assessorName) {
      alert('査定担当者を選択してください');
      return;
    }

    // 確認ダイアログ
    if (!confirm('査定を確定してもよろしいですか？')) {
      return;
    }

    const nextStatus = currentApp.approvalMethod === 'auto' ? 'auto_approved' : 'awaiting_approval';
    updateStatus(nextStatus, { assessorName: assessorName });
    alert(`査定を確定しました。\n買取合計金額: ¥${calculateTotal().toLocaleString()}\n次のステータス: ${getStatusLabel(nextStatus)}`);
  };

  // 在庫登録前の管理番号生成とモーダル表示
  const handleOpenInventoryModal = () => {
    // 各商品の管理番号を生成
    const managementNumbers = {};
    let sequenceCounter = 1;
    
    // 商品ごとにグループ化（同じ機種は連番）
    const productGroups = {};
    
    currentApp.items.forEach(item => {
      const productKey = `${item.manufacturer}_${item.console}`;
      if (!productGroups[productKey]) {
        productGroups[productKey] = [];
      }
      productGroups[productKey].push(item);
    });
    
    // 各商品に管理番号を生成
    Object.keys(productGroups).forEach(productKey => {
      let groupSequence = 1;
      productGroups[productKey].forEach(item => {
        const numbers = [];
        for (let i = 0; i < item.quantity; i++) {
          const managementNumber = generateManagementNumber(
            currentApp.customer.name,
            item.manufacturer,
            item.console,
            groupSequence,
            item.productType || 'console'
          );
          numbers.push(managementNumber);
          groupSequence++;
        }
        managementNumbers[item.id] = numbers;
      });
    });
    
    setGeneratedManagementNumbers(managementNumbers);
    setEditingManagementNumbers({}); // 編集モードをリセット
    setShowInventoryModal(true);
  };

  // 管理番号の編集を開始
  const handleStartEditManagementNumber = (itemId) => {
    setEditingManagementNumbers({...editingManagementNumbers, [itemId]: true});
  };

  // 管理番号の編集を保存
  const handleSaveManagementNumber = (itemId) => {
    setEditingManagementNumbers({...editingManagementNumbers, [itemId]: false});
  };

  // 管理番号の編集をキャンセル
  const handleCancelEditManagementNumber = (itemId) => {
    // 元の値に戻す（再生成）
    const item = currentApp.items.find(i => i.id === itemId);
    if (item) {
      const numbers = [];
      const productKey = `${item.manufacturer}_${item.console}`;
      let groupSequence = 1;
      
      for (let i = 0; i < item.quantity; i++) {
        const managementNumber = generateManagementNumber(
          currentApp.customer.name,
          item.manufacturer,
          item.console,
          groupSequence,
          item.productType || 'console'
        );
        numbers.push(managementNumber);
        groupSequence++;
      }
      
      setGeneratedManagementNumbers({
        ...generatedManagementNumbers,
        [itemId]: numbers
      });
    }
    setEditingManagementNumbers({...editingManagementNumbers, [itemId]: false});
  };

  // 個別の管理番号を編集
  const handleUpdateSingleManagementNumber = (itemId, index, newValue) => {
    const numbers = [...(generatedManagementNumbers[itemId] || [])];
    numbers[index] = newValue;
    setGeneratedManagementNumbers({
      ...generatedManagementNumbers,
      [itemId]: numbers
    });
  };

  // 在庫登録を実行
  const handleConfirmAddToInventory = async () => {
    // 在庫データを保存
    const inventoryData = JSON.parse(localStorage.getItem('inventory') || '[]');
    
    // 既存データのtitleフィールドを修正（undefinedを正しい値に置換）
    inventoryData.forEach(inv => {
      if (!inv.title || inv.title === 'undefined') {
        inv.title = inv.consoleLabel || inv.softwareName || 'ゲーム商品';
      }
    });
    localStorage.setItem('inventory', JSON.stringify(inventoryData));
    
    // 商品をグループ化（同じ商品は1つのZaico在庫として登録）
    const productGroups = {};
    for (const item of currentApp.items) {
      const productKey = `${item.productType}_${item.console}_${item.color || ''}_${item.accessories || ''}_${item.assessedRank}_${item.buybackPrice}_${item.softwareName || ''}`;
      
      if (!productGroups[productKey]) {
        productGroups[productKey] = {
          items: [],
          totalQuantity: 0,
          allManagementNumbers: []
        };
      }
      
      productGroups[productKey].items.push(item);
      productGroups[productKey].totalQuantity += item.quantity;
      productGroups[productKey].allManagementNumbers.push(...(generatedManagementNumbers[item.id] || []));
    }
    
    // グループ化された商品を処理
    for (const [productKey, group] of Object.entries(productGroups)) {
      const firstItem = group.items[0]; // 代表アイテム
      // 既存在庫に同じ商品（同じ機種、カラー、付属品、ランク、単価、仕入れ元）があるか確認
      const existingIndex = inventoryData.findIndex(inv => 
        inv.productType === firstItem.productType &&
        inv.console === firstItem.console &&
        inv.color === (firstItem.color || '') &&
        inv.accessories === (firstItem.accessories || '') &&
        inv.assessedRank === firstItem.assessedRank &&
        inv.buybackPrice === firstItem.buybackPrice &&
        inv.sourceType === 'customer' &&
        inv.customer?.name === currentApp.customer.name &&
        (firstItem.productType === 'software' ? inv.softwareName === firstItem.softwareName : true)
      );

      if (existingIndex !== -1) {
        // 既存在庫があれば数量を加算
        const beforeQuantity = inventoryData[existingIndex].quantity;
        inventoryData[existingIndex].quantity += group.totalQuantity;
        
        // titleフィールドを追加（既存データにない場合）
        if (!inventoryData[existingIndex].title || inventoryData[existingIndex].title === 'undefined') {
          inventoryData[existingIndex].title = firstItem.consoleLabel || firstItem.softwareName || 'ゲーム商品';
        }
        
        // 管理番号も追加
        const existingNumbers = inventoryData[existingIndex].managementNumbers || [];
        inventoryData[existingIndex].managementNumbers = [...existingNumbers, ...group.allManagementNumbers];
        
        // 在庫変更履歴を記録
        const inventoryHistory = JSON.parse(localStorage.getItem('inventoryHistory') || '[]');
        inventoryHistory.push({
          itemId: inventoryData[existingIndex].id,
          type: 'add',
          change: group.totalQuantity,
          beforeQuantity: beforeQuantity,
          afterQuantity: inventoryData[existingIndex].quantity,
          date: new Date().toISOString(),
          performedBy: currentApp.assessorName || 'スタッフ',
          reason: `買取処理（${currentApp.applicationNumber}）`,
          relatedTransaction: {
            type: 'buyback',
            applicationNumber: currentApp.applicationNumber,
            customer: currentApp.customer.name
          }
        });
        localStorage.setItem('inventoryHistory', JSON.stringify(inventoryHistory));

        recordLedgerPurchase({
          inventoryItem: inventoryData[existingIndex],
          quantity: group.totalQuantity,
          unitPriceJPY: firstItem.buybackPrice,
          eventDate: new Date().toISOString(),
          performer: currentApp.assessorName || '',
          reference: {
            type: 'buyback',
            applicationNumber: currentApp.applicationNumber
          },
          managementNumbers: group.allManagementNumbers
        });
      } else {
        // 新規在庫として追加
        const inventoryItem = {
          id: `INV-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          sourceType: 'customer',
          applicationNumber: currentApp.applicationNumber,
          productType: firstItem.productType,
          manufacturer: firstItem.manufacturer,
          manufacturerLabel: firstItem.manufacturerLabel,
          console: firstItem.console,
          consoleLabel: firstItem.consoleLabel,
          color: firstItem.color || '',
          colorLabel: firstItem.colorLabel || '',
          softwareName: firstItem.softwareName || '',
          condition: firstItem.condition || '',
          conditionLabel: firstItem.conditionLabel || '',
          accessories: firstItem.accessories || '',
          accessoriesLabel: firstItem.accessoriesLabel || '',
          assessedRank: firstItem.assessedRank,
          quantity: group.totalQuantity,
          buybackPrice: firstItem.buybackPrice,
          acquisitionPrice: firstItem.buybackPrice, // 統一
          title: firstItem.consoleLabel || firstItem.softwareName || 'ゲーム商品', // titleフィールドを追加
          managementNumbers: group.allManagementNumbers, // 管理番号を追加
          registeredDate: new Date().toISOString(),
          customer: {
            name: currentApp.customer.name,
            email: currentApp.customer.email,
            phone: currentApp.customer.phone,
            address: currentApp.customer.address,
            postalCode: currentApp.customer.postalCode,
            birthDate: currentApp.customer.birthDate,
            occupation: currentApp.customer.occupation
          }
        };
        inventoryData.push(inventoryItem);

        recordLedgerPurchase({
          inventoryItem,
          quantity: group.totalQuantity,
          unitPriceJPY: firstItem.buybackPrice,
          eventDate: inventoryItem.registeredDate,
          performer: currentApp.assessorName || '',
          reference: {
            type: 'buyback',
            applicationNumber: currentApp.applicationNumber
          },
          managementNumbers: group.allManagementNumbers
        });
        
        // zaico連携処理（入庫データとして登録して仕入単価を設定）
        try {
          console.log('=== zaico連携開始 ===');
          console.log('在庫データ:', inventoryItem);
          console.log('title:', inventoryItem.title);
          console.log('zaicoId:', inventoryItem.zaicoId);
          
          const zaicoResult = await createPurchaseInZaico(inventoryItem);
          console.log('zaico結果:', zaicoResult);
          
          // zaicoIdを在庫データに保存
          if (zaicoResult && zaicoResult.inventory && (zaicoResult.inventory.data_id || zaicoResult.inventory.id)) {
            const zaicoId = zaicoResult.inventory.data_id || zaicoResult.inventory.id;
            inventoryItem.zaicoId = zaicoId;
            console.log('zaicoIdを保存:', zaicoId);
            
            // 在庫データを更新して保存（inventoryDataを直接更新）
            const updatedIndex = inventoryData.findIndex(inv => inv.id === inventoryItem.id);
            if (updatedIndex !== -1) {
              inventoryData[updatedIndex].zaicoId = zaicoId;
              localStorage.setItem('inventory', JSON.stringify(inventoryData));
              console.log('在庫データにzaicoIdを保存完了');
              console.log('更新後の在庫データ:', inventoryData[updatedIndex]);
            } else {
              console.error('在庫データの更新に失敗: 該当IDが見つかりません');
            }
          } else {
            console.error('zaicoIdの取得に失敗:', zaicoResult);
          }
          logSyncActivity('buyback_create', 'success', { 
            itemId: inventoryItem.id, 
            applicationNumber: currentApp.applicationNumber,
            title: inventoryItem.consoleLabel || inventoryItem.softwareName,
            zaicoId: inventoryItem.zaicoId,
            method: 'purchase_with_unit_price'
          });
        } catch (error) {
          logSyncActivity('buyback_create', 'error', { 
            itemId: inventoryItem.id, 
            applicationNumber: currentApp.applicationNumber,
            error: error.message 
          });
          console.error('zaico連携エラー:', error);
        }
        
        // 初期在庫登録の履歴を記録
        const inventoryHistory = JSON.parse(localStorage.getItem('inventoryHistory') || '[]');
        inventoryHistory.push({
          itemId: inventoryItem.id,
          type: 'add',
          change: group.totalQuantity,
          beforeQuantity: 0,
          afterQuantity: group.totalQuantity,
          date: new Date().toISOString(),
          performedBy: currentApp.assessorName || 'スタッフ',
          reason: `買取処理（${currentApp.applicationNumber}）`,
          relatedTransaction: {
            type: 'buyback',
            applicationNumber: currentApp.applicationNumber,
            customer: currentApp.customer.name
          }
        });
        localStorage.setItem('inventoryHistory', JSON.stringify(inventoryHistory));
      }
    }
    
    localStorage.setItem('inventory', JSON.stringify(inventoryData));
    
    // 管理番号をアプリケーションデータに保存
    const updatedApplications = applications.map((app, index) => {
      if (index === selectedApplication) {
        return {
          ...app,
          status: 'in_inventory',
          items: app.items.map(item => ({
            ...item,
            managementNumbers: generatedManagementNumbers[item.id] || []
          }))
        };
      }
      return app;
    });
    
    setApplications(updatedApplications);
    localStorage.setItem('allApplications', JSON.stringify(updatedApplications));
    
    setShowInventoryModal(false);
    alert('在庫に登録しました');
  };

  const getStatusLabel = (status) => {
    const statusLabels = {
      'applied': '申込受付',
      'kit_sent': 'キット発送済',
      'pickup_scheduled': '集荷予定',
      'received': '商品到着',
      'assessing': '査定中',
      'awaiting_approval': '承認待ち',
      'approved': '買取確定',
      'auto_approved': '買取確定（自動承認）',
      'in_inventory': '在庫登録済'
    };
    return statusLabels[status] || status;
  };

  const getStatusBadge = (status) => {
    const statusConfig = {
      'applied': { class: 'status-applied', label: '📝 申込受付' },
      'kit_sent': { class: 'status-kit-sent', label: '📮 キット発送済' },
      'pickup_scheduled': { class: 'status-pickup', label: '🚚 集荷予定' },
      'received': { class: 'status-received', label: '📦 商品到着' },
      'assessing': { class: 'status-assessing', label: '🔍 査定中' },
      'awaiting_approval': { class: 'status-waiting', label: '⏳ 承認待ち' },
      'approved': { class: 'status-approved', label: '✅ 買取確定' },
      'auto_approved': { class: 'status-approved', label: '✅ 買取確定(自動)' },
      'in_inventory': { class: 'status-inventory', label: '📊 在庫登録済' }
    };
    
    const config = statusConfig[status] || { class: 'status-default', label: status };
    return <span className={`status-badge ${config.class}`}>{config.label}</span>;
  };

  const filteredApplications = statusFilter === 'all' 
    ? applications.filter(app => app.status !== 'in_inventory')
    : applications.filter(app => app.status === statusFilter && app.status !== 'in_inventory');

  // 申込が変わったら発送情報の表示状態をリセット
  useEffect(() => {
    if (currentApp) {
      // 商品到着以降のステータスなら閉じておく
      const completedStatuses = ['assessing', 'awaiting_approval', 'approved', 'auto_approved', 'in_inventory'];
      setShowShippingInfo(!completedStatuses.includes(currentApp.status));
      // 担当者名を設定（既にある場合）
      if (currentApp.assessorName) {
        setAssessorName(currentApp.assessorName);
      } else {
        setAssessorName('');
      }
    }
  }, [selectedApplication, currentApp?.status]);

  if (!currentApp && applications.length > 0 && selectedApplication === null) {
    setSelectedApplication(0);
  }

  return (
    <>
      {/* 印刷用見積書 */}
      {currentApp && printMode === 'estimate' && (
        <div className="print-only estimate-sheet">
          <div className="estimate-header">
            <div className="estimate-header-left">
              <h1>買取見積書</h1>
              <div className="estimate-number">見積番号: {currentApp.applicationNumber}</div>
              <div className="estimate-date">発行日: {getTodayJST()}</div>
            </div>
            <div className="estimate-header-right">
              <h2>{companyInfo.name}</h2>
              <p>{companyInfo.postalCode} {companyInfo.address}</p>
              <p>{companyInfo.phone}</p>
              <p>{companyInfo.email}</p>
              {(currentApp.assessorName || assessorName) && (
                <p><strong>担当者:</strong> {currentApp.assessorName || assessorName}</p>
              )}
            </div>
          </div>

          <div className="estimate-customer">
            <h2>お客様情報</h2>
            <p><strong>お名前:</strong> {currentApp.customer.name} 様</p>
            {(currentApp.customer.birthDate || currentApp.customer.occupation) && (
              <p>
                {currentApp.customer.birthDate && <><strong>生年月日:</strong> {currentApp.customer.birthDate}</>}
                {currentApp.customer.birthDate && currentApp.customer.occupation && ' / '}
                {currentApp.customer.occupation && <><strong>職業:</strong> {currentApp.customer.occupation}</>}
              </p>
            )}
            <p><strong>住所:</strong> {currentApp.customer.postalCode} {currentApp.customer.address}</p>
            <p><strong>TEL:</strong> {currentApp.customer.phone} / <strong>Email:</strong> {currentApp.customer.email}</p>
          </div>

          <div className="estimate-message">
            <p>下記の通り、お見積もりいたします。</p>
          </div>

          <table className="estimate-table">
            <thead>
              <tr>
                <th>No.</th>
                <th>品名</th>
                <th>状態</th>
                <th>付属品</th>
                <th>査定ランク</th>
                <th>数量</th>
                <th>単価</th>
                <th>金額</th>
                <th>備考</th>
              </tr>
            </thead>
            <tbody>
              {currentApp.items.map((item, index) => (
                <React.Fragment key={item.id}>
                  <tr>
                    <td>{index + 1}</td>
                    <td>
                      {item.productType === 'software' ? (
                        <>
                          {item.softwareName}<br />
                          <small>({item.manufacturerLabel} - {item.consoleLabel})</small>
                        </>
                      ) : (
                        `${item.manufacturerLabel} - ${item.consoleLabel}`
                    )}
                  </td>
                  <td>{item.condition || '-'}</td>
                  <td>{item.productType === 'console' ? getShortAccessoriesLabel(item.accessories) : '-'}</td>
                  <td>{item.assessedRank || '-'}</td>
                  <td>{item.quantity}</td>
                  <td>¥{(item.buybackPrice || 0).toLocaleString()}</td>
                  <td>¥{((item.buybackPrice || 0) * item.quantity).toLocaleString()}</td>
                  <td className="notes-cell">{item.itemNotes ? '📝' : '-'}</td>
                </tr>
                  {/* C評価の場合、お客様が入力した状態詳細を追加行で表示 */}
                  {item.condition === 'C' && item.conditionNotes && (
                    <tr className="condition-detail-row">
                      <td colSpan="9" className="condition-detail-cell">
                        <div className="condition-detail-content">
                          <strong>状態詳細（お客様記入）：</strong> {item.conditionNotes}
                        </div>
                      </td>
                    </tr>
                  )}
                  {/* 備考がある場合の追加行 */}
                  {item.itemNotes && (
                    <tr className="notes-detail-row">
                      <td colSpan="9" className="notes-detail-cell">
                        <div className="notes-detail-content">
                          <strong>備考：</strong> {item.itemNotes}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>

          <div className="estimate-total">
            <div className="total-row grand-total">
              <span>合計買取金額</span>
              <span>¥{calculateTotal().toLocaleString()}</span>
            </div>
          </div>

          <div className="estimate-notes">
            <h3>備考</h3>
            {currentApp.notes && <p>{currentApp.notes}</p>}
            <div className="condition-rank-guide">
              <p><strong>【状態ランク説明】</strong></p>
              <p>S：極美品・未使用に近い / A：美品・目立つ傷なし / B：使用感あり・通常使用可 / C：傷・汚れあり・動作に問題なし</p>
            </div>
            <p>※ 上記金額は査定結果に基づく買取金額です。</p>
            <p>※ 商品の状態により、金額が変更になる場合がございます。</p>
          </div>

          <div className="estimate-footer">
            <p className="license">{companyInfo.license}</p>
          </div>
        </div>
      )}


      {/* 通常の画面表示 */}
      <div className="rating-container screen-only">
      
      {/* 初期選択画面 */}
      {viewMode === 'selection' && (
        <>
          <h1>買取査定画面</h1>
          <p className="subtitle">取引を選択してください</p>

          <div className="selection-screen">
            <button 
              className="selection-btn ongoing-btn"
              onClick={() => setViewMode('ongoing')}
            >
              <div className="btn-icon">🔄</div>
              <div className="btn-title">進行中の取引</div>
              <div className="btn-description">査定中・対応中の取引を表示</div>
              <div className="btn-count">{applications.filter(app => app.status !== 'in_inventory').length}件</div>
            </button>

            <button 
              className="selection-btn completed-btn"
              onClick={() => setViewMode('completed')}
            >
              <div className="btn-icon">✅</div>
              <div className="btn-title">過去の取引</div>
              <div className="btn-description">完了済みの取引を表示</div>
              <div className="btn-count">{applications.filter(app => app.status === 'in_inventory').length}件</div>
            </button>
          </div>
        </>
      )}

      {/* 進行中の取引一覧 */}
      {viewMode === 'ongoing' && (
        <div className="list-screen">
          <div className="list-header">
            <h1>🔄 進行中の取引</h1>
            <button className="back-btn" onClick={() => setViewMode('selection')}>
              ← 戻る
            </button>
          </div>
          <div className="transaction-list">
            {applications
              .filter(app => app.status !== 'in_inventory')
              .sort((a, b) => new Date(b.date) - new Date(a.date))
              .map((app, index) => {
                const actualIndex = applications.indexOf(app);
                return (
                  <div
                    key={app.applicationNumber}
                    className="transaction-card"
                    onClick={() => {
                      setSelectedApplication(actualIndex);
                      setPreviousViewMode('ongoing');
                      setViewMode('detail');
                    }}
                  >
                    <div className="card-header-row">
                      <div className="card-app-number">{app.applicationNumber}</div>
                      <span className="card-type-badge">{app.type === 'simple' ? '🎯 カンタン' : '📝 詳細'}</span>
                    </div>
                    <div className="card-customer">
                      <strong>👤 {app.customer.name}</strong> 様
                    </div>
                    <div className="card-date">
                      📅 {new Date(app.date).toLocaleDateString('ja-JP')}
                    </div>
                    <div className="card-status">
                      {getStatusBadge(app.status)}
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* 過去の取引一覧 */}
      {viewMode === 'completed' && (
        <div className="list-screen">
          <div className="list-header">
            <h1>✅ 過去の取引</h1>
            <button className="back-btn" onClick={() => setViewMode('selection')}>
              ← 戻る
            </button>
          </div>
          <div className="transaction-list">
            {applications
              .filter(app => app.status === 'in_inventory')
              .sort((a, b) => new Date(b.date) - new Date(a.date))
              .map((app, index) => {
                const actualIndex = applications.indexOf(app);
                return (
                  <div
                    key={app.applicationNumber}
                    className="transaction-card completed-card"
                  >
                    <div 
                      className="card-clickable-area"
                      onClick={() => {
                        setSelectedApplication(actualIndex);
                        setPreviousViewMode('completed');
                        setViewMode('detail');
                      }}
                    >
                      <div className="card-header-row">
                        <div className="card-app-number">{app.applicationNumber}</div>
                        <span className="card-type-badge">{app.type === 'simple' ? '🎯 カンタン' : '📝 詳細'}</span>
                      </div>
                      <div className="card-customer">
                        <strong>👤 {app.customer.name}</strong> 様
                      </div>
                      <div className="card-date">
                        📅 {new Date(app.date).toLocaleDateString('ja-JP')}
                      </div>
                      <div className="card-status">
                        {getStatusBadge(app.status)}
                      </div>
                    </div>
                    <button 
                      className="card-print-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedApplication(actualIndex);
                        // 少し遅延させてからhandlePrintを呼ぶ
                        setTimeout(() => {
                          if (app.items && app.items.length > 0) {
                            window.print();
                          } else {
                            alert('印刷する商品がありません');
                          }
                        }, 100);
                      }}
                      title="見積書を印刷"
                    >
                      🖨️
                    </button>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* 詳細画面（既存のUI） */}
      {viewMode === 'detail' && currentApp && (
        <>
        <div className="detail-header">
          <h1>買取査定画面</h1>
          <button className="back-btn-right" onClick={() => {
            setViewMode(previousViewMode || (currentApp.status === 'in_inventory' ? 'completed' : 'ongoing'));
          }}>
            ← 一覧に戻る
          </button>
        </div>

      <div className={previousViewMode === 'completed' ? 'detail-only-layout' : 'rating-layout'}>
        <div className="application-list-panel">
          <div className="filter-section">
            <h3>📊 ステータスフィルター</h3>
            <select 
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="status-filter-select"
            >
              <option value="all">全て表示</option>
              <option value="applied">📝 申込受付</option>
              <option value="kit_sent">📮 キット発送済</option>
              <option value="pickup_scheduled">🚚 集荷予定</option>
              <option value="received">📦 商品到着</option>
              <option value="assessing">🔍 査定中</option>
              <option value="awaiting_approval">⏳ 承認待ち</option>
              <option value="approved">✅ 買取確定</option>
              <option value="auto_approved">✅ 買取確定(自動)</option>
            </select>
          </div>

          <div className="application-list">
            <h2>申込一覧 ({filteredApplications.length}件)</h2>
            {filteredApplications.length === 0 ? (
              <div className="empty-list">該当する申込がありません</div>
            ) : (
              filteredApplications.map((app) => {
                const actualIndex = applications.indexOf(app);
                return (
                  <div
                    key={app.applicationNumber}
                    className={`application-item ${selectedApplication === actualIndex ? 'active' : ''}`}
                    onClick={() => setSelectedApplication(actualIndex)}
                  >
                    <div className="app-item-header">
                      <strong>{app.applicationNumber}</strong>
                      <span className="app-type-badge">{app.type === 'simple' ? '🎯 カンタン' : '📝 詳細'}</span>
                    </div>
                    <p className="app-customer">{app.customer.name} 様</p>
                    <p className="app-date">{new Date(app.date).toLocaleString('ja-JP')}</p>
                    {getStatusBadge(app.status)}
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className={previousViewMode === 'completed' ? 'application-detail-panel-full' : 'application-detail-panel'}>
            {/* 進捗バー */}
            <div className="progress-bar-section">
              <h3>📊 買取進捗状況</h3>
              <div className="progress-steps">
                <div className={`progress-step ${['applied', 'kit_sent', 'pickup_scheduled', 'received', 'assessing', 'awaiting_approval', 'approved', 'auto_approved', 'in_inventory'].includes(currentApp.status) ? 'completed' : 'pending'}`}>
                  <div className="step-circle">1</div>
                  <span className="step-label">申込受付</span>
                </div>
                <div className={`progress-line ${['kit_sent', 'pickup_scheduled', 'received', 'assessing', 'awaiting_approval', 'approved', 'auto_approved', 'in_inventory'].includes(currentApp.status) ? 'completed' : 'pending'}`}></div>
                <div className={`progress-step ${['kit_sent', 'pickup_scheduled', 'received', 'assessing', 'awaiting_approval', 'approved', 'auto_approved', 'in_inventory'].includes(currentApp.status) ? 'completed' : currentApp.status === 'applied' ? 'current' : 'pending'}`}>
                  <div className="step-circle">2</div>
                  <span className="step-label">発送準備</span>
                </div>
                <div className={`progress-line ${['received', 'assessing', 'awaiting_approval', 'approved', 'auto_approved', 'in_inventory'].includes(currentApp.status) ? 'completed' : 'pending'}`}></div>
                <div className={`progress-step ${['received', 'assessing', 'awaiting_approval', 'approved', 'auto_approved', 'in_inventory'].includes(currentApp.status) ? 'completed' : ['kit_sent', 'pickup_scheduled'].includes(currentApp.status) ? 'current' : 'pending'}`}>
                  <div className="step-circle">3</div>
                  <span className="step-label">商品到着</span>
                </div>
                <div className={`progress-line ${['assessing', 'awaiting_approval', 'approved', 'auto_approved', 'in_inventory'].includes(currentApp.status) ? 'completed' : 'pending'}`}></div>
                <div className={`progress-step ${['assessing', 'awaiting_approval', 'approved', 'auto_approved', 'in_inventory'].includes(currentApp.status) ? 'completed' : currentApp.status === 'received' ? 'current' : 'pending'}`}>
                  <div className="step-circle">4</div>
                  <span className="step-label">査定中</span>
                </div>
                <div className={`progress-line ${['awaiting_approval', 'approved', 'auto_approved', 'in_inventory'].includes(currentApp.status) ? 'completed' : 'pending'}`}></div>
                <div className={`progress-step ${['awaiting_approval', 'approved', 'auto_approved', 'in_inventory'].includes(currentApp.status) ? 'completed' : currentApp.status === 'assessing' ? 'current' : 'pending'}`}>
                  <div className="step-circle">5</div>
                  <span className="step-label">承認・確定</span>
                </div>
                <div className={`progress-line ${['in_inventory'].includes(currentApp.status) ? 'completed' : 'pending'}`}></div>
                <div className={`progress-step ${currentApp.status === 'in_inventory' ? 'completed' : ['approved', 'auto_approved'].includes(currentApp.status) ? 'current' : 'pending'}`}>
                  <div className="step-circle">6</div>
                  <span className="step-label">完了</span>
                </div>
              </div>
            </div>

            {/* 申込情報とお客様情報をコンパクトに */}
            <div className="compact-info-section">
              <div className="compact-info-left">
                <h3>📋 申込情報</h3>
                <p><strong>申込番号:</strong> {currentApp.applicationNumber}</p>
                <p><strong>タイプ:</strong> {currentApp.type === 'simple' ? '🎯 カンタン' : '📝 詳細'}</p>
                <p><strong>日時:</strong> {new Date(currentApp.date).toLocaleString('ja-JP')}</p>
                <p><strong>ステータス:</strong> {getStatusBadge(currentApp.status)}</p>
              </div>
              <div className="compact-info-right">
                <h3>👤 お客様情報</h3>
                <p><strong>{currentApp.customer.name}</strong> 様</p>
                {currentApp.customer.birthDate && (
                  <p>🎂 生年月日: {currentApp.customer.birthDate} (満{Math.floor((new Date() - new Date(currentApp.customer.birthDate)) / (365.25 * 24 * 60 * 60 * 1000))}歳)</p>
                )}
                {currentApp.customer.occupation && (
                  <p>💼 職業: {currentApp.customer.occupation}</p>
                )}
                <p>📧 {currentApp.customer.email}</p>
                <p>📞 {currentApp.customer.phone}</p>
                <p>🏠 {currentApp.customer.address}</p>
              </div>
            </div>

            {/* 発送情報（承認後は非表示） */}
            {!['approved', 'auto_approved', 'in_inventory'].includes(currentApp.status) && (
            <div className="detail-section">
              <div className="collapsible-header" onClick={() => setShowShippingInfo(!showShippingInfo)}>
                <h2>📦 発送情報</h2>
                <span className="collapse-icon">{showShippingInfo ? '▼' : '▶'}</span>
              </div>
              
              {showShippingInfo && (
              <div className="shipping-layout">
                <div className="shipping-info-left">
                  <p><strong>発送方法:</strong> {currentApp.shippingInfo.shippingMethod === 'customer' || currentApp.shippingInfo.shippingMethod === 'own' ? '📦 お客様自身での発送' : '🚚 着払い（ヤマト運輸指定）'}</p>
                  
                  {currentApp.shippingInfo.receivedDate && (
                    <p><strong>✅ 商品到着日:</strong> {currentApp.shippingInfo.receivedDate}</p>
                  )}
                </div>

                <div className="shipping-actions">
                  {(currentApp.status === 'applied' || currentApp.status === 'kit_sent' || currentApp.status === 'pickup_scheduled') && !currentApp.shippingInfo.receivedDate && (
                    <>
                      <div className="form-group">
                        <label>📅 商品到着日</label>
                        <input
                          type="date"
                          id="receivedDate"
                          defaultValue={getTodayJST()}
                        />
                      </div>
                      <button onClick={() => {
                        const date = document.getElementById('receivedDate').value;
                        updateStatus('assessing', {
                          shippingInfo: { ...currentApp.shippingInfo, receivedDate: date }
                        });
                        alert('商品到着を記録しました。査定を開始してください。');
                      }} className="action-btn btn-success">
                        📦 商品到着を記録
                      </button>
                    </>
                  )}
                </div>
              </div>
              )}
            </div>
            )}

            {/* カンタン見積もりの場合、特記事項表示（承認後は非表示） */}
            {!['approved', 'auto_approved', 'in_inventory'].includes(currentApp.status) && currentApp.type === 'simple' && currentApp.notes && (
              <div className="detail-section">
                <h2>📝 特記事項</h2>
                <div className="notes-display">{currentApp.notes}</div>
              </div>
            )}

            {/* 査定商品リスト */}
            {(currentApp.status === 'assessing' || currentApp.status === 'awaiting_approval' || currentApp.status === 'approved' || currentApp.status === 'auto_approved' || currentApp.status === 'in_inventory') && (
              <>
                <div className="detail-section">
                  <div className="section-header">
                    <h2>🎮 査定商品リスト</h2>
                    {currentApp.type === 'simple' && !['approved', 'auto_approved', 'in_inventory'].includes(currentApp.status) && (
                      <button 
                        onClick={() => setShowAddItem(!showAddItem)} 
                        className="add-item-toggle-btn"
                      >
                        {showAddItem ? '✕ 閉じる' : '➕ 商品を追加'}
                      </button>
                    )}
                  </div>

                  {/* 商品追加フォーム（カンタン見積もりの場合） */}
                  {currentApp.type === 'simple' && showAddItem && (
                    <div className="add-item-form">
                      <h3>商品を追加</h3>
                      <div className="add-item-grid">
                        <div className="form-group">
                          <label>商品タイプ</label>
                          <select value={newItem.productType} onChange={(e) => setNewItem({...newItem, productType: e.target.value})}>
                            <option value="console">ゲーム本体</option>
                            <option value="software">ゲームソフト</option>
                          </select>
                        </div>
                        
                        <div className="form-group">
                          <label>メーカー *</label>
                          <select value={newItem.manufacturer} onChange={(e) => handleManufacturerChange(e.target.value)}>
                            <option value="">選択してください</option>
                            {manufacturers.map(mfr => (
                              <option key={mfr.value} value={mfr.value}>{mfr.label}</option>
                            ))}
                          </select>
                        </div>

                        <div className="form-group">
                          <label>機種 *</label>
                          <select 
                            value={newItem.console}
                            onChange={(e) => setNewItem({...newItem, console: e.target.value})}
                            disabled={!newItem.manufacturer}
                          >
                            <option value="">選択してください</option>
                            {availableConsoles.map(console => (
                              <option key={console.value} value={console.value}>{console.label}</option>
                            ))}
                          </select>
                        </div>

                        {newItem.productType === 'console' && (
                          <div className="form-group">
                            <label>カラー（任意）</label>
                            <select 
                              value={newItem.color}
                              onChange={(e) => setNewItem({...newItem, color: e.target.value})}
                            >
                              <option value="">選択しない</option>
                              {colors.map(color => (
                                <option key={color} value={color}>{color}</option>
                              ))}
                            </select>
                          </div>
                        )}

                        {newItem.productType === 'software' && (
                          <div className="form-group full-width">
                            <label>ソフト名 *</label>
                            <input
                              type="text"
                              value={newItem.softwareName}
                              onChange={(e) => setNewItem({...newItem, softwareName: e.target.value})}
                              placeholder="例: ゼルダの伝説 ティアーズ オブ ザ キングダム"
                            />
                          </div>
                        )}

                        <div className="form-group">
                          <label>状態</label>
                          <select value={newItem.condition} onChange={(e) => setNewItem({...newItem, condition: e.target.value})}>
                            <option value="">選択してください</option>
                            {conditions.map(cond => (
                              <option key={cond.value} value={cond.value}>{cond.label}</option>
                            ))}
                          </select>
                        </div>

                        <div className="form-group">
                          <label>数量</label>
                          <input
                            type="number"
                            min="1"
                            value={newItem.quantity}
                            onChange={(e) => setNewItem({...newItem, quantity: parseInt(e.target.value) || 1})}
                          />
                        </div>
                      </div>
                      <button onClick={handleAddItem} className="add-item-btn">商品を追加</button>
                    </div>
                  )}

                  {/* 査定テーブル */}
                  {currentApp.items && currentApp.items.length > 0 ? (
                    <div className="rating-table-wrapper">
                      <table className="rating-table">
                        <thead>
                          <tr>
                            {currentApp.status === 'in_inventory' && <th>管理番号</th>}
                            <th>商品タイプ</th>
                            <th>メーカー・機種</th>
                            <th>状態</th>
                            <th>付属品</th>
                            <th>数量</th>
                            <th>査定ランク</th>
                            <th>買取単価</th>
                            <th>小計</th>
                            <th>備考</th>
                            {!['approved', 'auto_approved', 'in_inventory'].includes(currentApp.status) && <th>操作</th>}
                          </tr>
                        </thead>
                        <tbody>
                          {currentApp.items.map(item => (
                            <React.Fragment key={item.id}>
                              <tr className={item.assessedRank === 'C' && (!item.itemNotes || item.itemNotes.trim() === '') ? 'needs-notes' : ''}>
                                {currentApp.status === 'in_inventory' && (
                                  <td className="management-number-cell">
                                    {item.managementNumbers && item.managementNumbers.length > 0 ? (
                                      <span className="management-number-display">
                                        {(() => {
                                          const first = item.managementNumbers[0];
                                          const last = item.managementNumbers[item.managementNumbers.length - 1];
                                          const firstSeq = first.split('_').pop();
                                          const lastSeq = last.split('_').pop();
                                          const baseNumber = first.substring(0, first.lastIndexOf('_') + 1);
                                          
                                          if (item.managementNumbers.length === 1) {
                                            return first;
                                          } else {
                                            return `${baseNumber}${firstSeq}~${lastSeq}`;
                                          }
                                        })()}
                                      </span>
                                    ) : (
                                      <span className="no-management-number">-</span>
                                    )}
                                  </td>
                                )}
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
                                <td>{item.conditionLabel}</td>
                                <td className="accessories-cell">{item.productType === 'console' ? getShortAccessoriesLabel(item.accessories) : '-'}</td>
                                <td>{item.quantity}</td>
                                <td>
                                  {['approved', 'auto_approved', 'in_inventory'].includes(currentApp.status) ? (
                                    item.assessedRank || '-'
                                  ) : (
                                    <select
                                      value={item.assessedRank || ''}
                                      onChange={(e) => handleRankChange(item.id, e.target.value)}
                                      className="rank-select"
                                    >
                                      <option value="">選択</option>
                                      <option value="S">S</option>
                                      <option value="A">A</option>
                                      <option value="B">B</option>
                                      <option value="C">C</option>
                                    </select>
                                  )}
                                </td>
                                <td>
                                  {['approved', 'auto_approved', 'in_inventory'].includes(currentApp.status) ? (
                                    `¥${(item.buybackPrice || 0).toLocaleString()}`
                                  ) : (
                                    <input
                                      type="text"
                                      value={item.buybackPrice || ''}
                                      onChange={(e) => handlePriceChange(item.id, e.target.value)}
                                      className="price-input"
                                      placeholder="0"
                                      onWheel={(e) => e.preventDefault()}
                                      onKeyDown={(e) => {
                                        // 数字、バックスペース、Delete、矢印キーのみ許可
                                        if (!/[0-9]/.test(e.key) && !['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.key)) {
                                          e.preventDefault();
                                        }
                                      }}
                                    />
                                  )}
                                </td>
                                <td className="subtotal">¥{((item.buybackPrice || 0) * item.quantity).toLocaleString()}</td>
                                <td className="notes-cell-action">
                                  {['approved', 'auto_approved', 'in_inventory'].includes(currentApp.status) ? (
                                    item.itemNotes ? '📝' : '-'
                                  ) : (
                                    <button 
                                      className="toggle-notes-btn"
                                      onClick={() => setShowNotesFor({...showNotesFor, [item.id]: !showNotesFor[item.id]})}
                                      title={showNotesFor[item.id] ? "備考を閉じる" : "備考を追加"}
                                    >
                                      {showNotesFor[item.id] ? '➖' : '➕'}
                                    </button>
                                  )}
                                </td>
                                {!['approved', 'auto_approved', 'in_inventory'].includes(currentApp.status) && (
                                  <td>
                                    {item.quantity > 1 && currentApp.status === 'assessing' && (
                                      <button 
                                        onClick={() => handleSplitItem(item.id)} 
                                        className="split-btn"
                                        title="1台ずつに分割して個別に査定"
                                      >
                                        🔀 分割
                                      </button>
                                    )}
                                    {currentApp.type === 'simple' && (
                                      <button onClick={() => handleRemoveItem(item.id)} className="delete-btn">削除</button>
                                    )}
                                  </td>
                                )}
                              </tr>
                              {/* C評価の場合、お客様が入力した状態詳細を追加行で表示 */}
                              {item.condition === 'C' && item.conditionNotes && (
                                <tr className="condition-detail-row">
                                  <td colSpan={currentApp.status === 'in_inventory' ? '11' : '10'} className="condition-detail-cell">
                                    <div className="condition-detail-content">
                                      <strong>状態詳細（お客様記入）：</strong> {item.conditionNotes}
                                    </div>
                                  </td>
                                </tr>
                              )}
                              {/* 備考欄を追加している場合の入力行 */}
                              {showNotesFor[item.id] && !['approved', 'auto_approved', 'in_inventory'].includes(currentApp.status) && (
                                <tr className="notes-detail-row">
                                  <td colSpan="10" className="notes-detail-cell">
                                    <div className="notes-detail-content">
                                      <label><strong>📝 備考：</strong></label>
                                      <input
                                        type="text"
                                        value={item.itemNotes || ''}
                                        onChange={(e) => handleNotesChange(item.id, e.target.value)}
                                        className="notes-input-expanded"
                                        placeholder="備考を入力してください"
                                      />
                                    </div>
                                  </td>
                                </tr>
                              )}
                              {/* 買取確定後・在庫登録済の場合で備考がある場合 */}
                              {['approved', 'auto_approved', 'in_inventory'].includes(currentApp.status) && item.itemNotes && (
                                <tr className="notes-detail-row">
                                  <td colSpan={currentApp.status === 'in_inventory' ? '11' : '10'} className="notes-detail-cell">
                                    <div className="notes-detail-content">
                                      <strong>備考：</strong> {item.itemNotes}
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="no-items">
                      {currentApp.type === 'simple' ? (
                        <p>商品が登録されていません。「商品を追加」ボタンから商品を登録してください。</p>
                      ) : (
                        <p>お客様が商品を登録していません。</p>
                      )}
                    </div>
                  )}

                  <div className="total-section">
                    <span className="total-label">買取合計金額</span>
                    <span className="total-value">¥{calculateTotal().toLocaleString()}</span>
                  </div>
                </div>
              </>
            )}



            {/* 担当者表示（査定完了後） */}
            {currentApp.assessorName && (currentApp.status === 'awaiting_approval' || currentApp.status === 'approved' || currentApp.status === 'auto_approved' || currentApp.status === 'in_inventory') && (
              <div className="assessor-display">
                <span className="assessor-label">👤 査定担当者:</span>
                <span className="assessor-name">{currentApp.assessorName.match(/^(.+?)（/) ? currentApp.assessorName.match(/^(.+?)（/)[1] : currentApp.assessorName}</span>
              </div>
            )}

            {/* 査定担当者選択 */}
            {currentApp.status === 'assessing' && (
              <div className="assessor-selection-section">
                <label htmlFor="assessor-select">👤 査定担当者 *</label>
                <select
                  id="assessor-select"
                  value={assessorName}
                  onChange={(e) => setAssessorName(e.target.value)}
                  className="assessor-select"
                >
                  <option value="">選択してください</option>
                  {staffMembers.map(member => (
                    <option key={member} value={member}>{member}</option>
                  ))}
                </select>
              </div>
            )}

            {/* アクションボタン */}
            <div className="action-buttons">
              {currentApp.status === 'assessing' && (
                <>
                  <button className="print-button" onClick={handlePrint}>🖨️ 見積書印刷</button>
                  <button className="confirm-button" onClick={handleConfirmRating}>
                    ✅ 査定を確定する
                  </button>
                </>
              )}
              
              {currentApp.status === 'awaiting_approval' && (
                <div className="awaiting-approval-section">
                  <button className="print-button-right" onClick={handlePrint}>🖨️ 見積書印刷</button>
                  <div className="info-message-below">
                    <p>⏳ お客様の承認待ちです。お客様が承認すると自動的に次のステップに進みます。</p>
                  </div>
                </div>
              )}
              
              {(currentApp.status === 'approved' || currentApp.status === 'auto_approved') && (
                <>
                  <button className="print-button" onClick={handlePrint}>🖨️ 見積書印刷</button>
                  <div className="info-message">
                    <p>💡 買取が確定しました。顧客へ振込手続きについて連絡し、振込完了後に在庫登録してください。</p>
                  </div>
                  <button className="confirm-button" onClick={handleOpenInventoryModal}>
                    📊 在庫に登録する
                  </button>
                </>
              )}
              
              {currentApp.status === 'in_inventory' && (
                <button className="print-button" onClick={handlePrint}>🖨️ 見積書印刷</button>
              )}
            </div>
        </div>
      </div>
      </>
      )}
    </div>

      {/* 在庫登録確認モーダル */}
      {showInventoryModal && currentApp && (
        <div className="modal-overlay" onClick={() => setShowInventoryModal(false)}>
          <div className="inventory-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>📦 在庫登録の確認</h2>
              <button className="modal-close-btn" onClick={() => setShowInventoryModal(false)}>×</button>
            </div>
            
            <div className="modal-body">
              <p className="modal-intro">以下の商品を在庫に登録します。管理番号を確認してください。</p>
              
              <div className="inventory-items-list">
                {currentApp.items.map((item, index) => {
                  const numbers = generatedManagementNumbers[item.id] || [];
                  const isEditing = editingManagementNumbers[item.id];
                  const first = numbers[0];
                  const last = numbers[numbers.length - 1];
                  const displayNumber = numbers.length === 1 
                    ? first 
                    : `${first?.substring(0, first.lastIndexOf('_') + 1)}${first?.split('_').pop()}~${last?.split('_').pop()}`;
                  
                  return (
                    <div key={item.id} className="inventory-item-card">
                      <div className="item-info">
                        <span className="item-number">#{index + 1}</span>
                        <div className="item-details">
                          <strong>
                            {item.productType === 'software' ? item.softwareName : `${item.manufacturerLabel} - ${item.consoleLabel}`}
                          </strong>
                          <div className="item-meta">
                            数量: {item.quantity}点 / ランク: {item.assessedRank} / 単価: ¥{(item.buybackPrice || 0).toLocaleString()}
                          </div>
                        </div>
                      </div>
                      
                      {!isEditing ? (
                        <div className="management-number-display-modal">
                          <div className="management-label">管理番号:</div>
                          <div className="management-value">{displayNumber}</div>
                          <div className="management-count">({numbers.length}点)</div>
                          <button 
                            className="edit-management-btn"
                            onClick={() => handleStartEditManagementNumber(item.id)}
                            title="管理番号を編集"
                          >
                            ✏️ 編集
                          </button>
                        </div>
                      ) : (
                        <div className="management-number-edit-modal">
                          <div className="management-label">管理番号を編集:</div>
                          <div className="management-inputs-list">
                            {numbers.map((number, idx) => (
                              <div key={idx} className="management-input-row">
                                <span className="input-index">{idx + 1}.</span>
                                <input
                                  type="text"
                                  value={number}
                                  onChange={(e) => handleUpdateSingleManagementNumber(item.id, idx, e.target.value)}
                                  className="management-input"
                                  placeholder="管理番号を入力"
                                />
                              </div>
                            ))}
                          </div>
                          <div className="edit-actions">
                            <button 
                              className="btn-save-edit"
                              onClick={() => handleSaveManagementNumber(item.id)}
                            >
                              ✓ 保存
                            </button>
                            <button 
                              className="btn-cancel-edit"
                              onClick={() => handleCancelEditManagementNumber(item.id)}
                            >
                              ✕ キャンセル
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              
              <div className="modal-total">
                <span>合計:</span>
                <strong>{currentApp.items.reduce((sum, item) => sum + item.quantity, 0)}点</strong>
              </div>
            </div>
            
            <div className="modal-footer">
              <button className="btn-cancel" onClick={() => setShowInventoryModal(false)}>
                キャンセル
              </button>
              <button className="btn-confirm" onClick={handleConfirmAddToInventory}>
                ✓ 登録実行
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default Rating;
