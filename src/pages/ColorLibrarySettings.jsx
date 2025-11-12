import React, { useEffect, useMemo, useState } from 'react';
import {
  manufacturers,
  consoleColorOptions,
  colors as genericColors
} from '../data/gameConsoles';
import {
  getAllConsoles,
  getCustomConsoleColors,
  saveCustomConsoleColors
} from '../utils/productMaster';
import './ColorLibrarySettings.css';

const ColorLibrarySettings = () => {
  const allConsoles = useMemo(() => getAllConsoles(), []);
  const [customColors, setCustomColors] = useState(() => getCustomConsoleColors());
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedManufacturer, setSelectedManufacturer] = useState(
    manufacturers[0]?.value || ''
  );
  const initialConsole =
    (allConsoles[manufacturers[0]?.value] || [])[0]?.value || '';
  const [selectedConsole, setSelectedConsole] = useState(initialConsole);

  const [newColorName, setNewColorName] = useState('');
  const [newColorReleaseDate, setNewColorReleaseDate] = useState('');
  const [newColorNotes, setNewColorNotes] = useState('');

  const [editingColorId, setEditingColorId] = useState(null);
  const [editingDraft, setEditingDraft] = useState({
    name: '',
    releaseDate: '',
    notes: ''
  });

  // persist custom colors
  useEffect(() => {
    saveCustomConsoleColors(customColors);
  }, [customColors]);

  const filteredConsolesByManufacturer = useMemo(() => {
    const keyword = searchQuery.trim().toLocaleLowerCase();
    const result = {};

    manufacturers.forEach((mfr) => {
      const list = allConsoles[mfr.value] || [];
      result[mfr.value] = keyword
        ? list.filter((item) => {
            const label = (item.label || '').toLocaleLowerCase();
            const value = (item.value || '').toLocaleLowerCase();
            return label.includes(keyword) || value.includes(keyword);
          })
        : list;
    });

    return result;
  }, [searchQuery, allConsoles]);

  // ensure selected manufacturer has at least one console after filtering
  useEffect(() => {
    const hasCurrent =
      (filteredConsolesByManufacturer[selectedManufacturer] || []).length > 0;

    if (!hasCurrent) {
      const next = manufacturers.find(
        (mfr) => (filteredConsolesByManufacturer[mfr.value] || []).length > 0
      );
      if (next) {
        setSelectedManufacturer(next.value);
        const firstConsole =
          (filteredConsolesByManufacturer[next.value] || [])[0]?.value || '';
        setSelectedConsole(firstConsole);
      } else {
        setSelectedConsole('');
      }
    }
  }, [filteredConsolesByManufacturer, selectedManufacturer]);

  // ensure selected console belongs to current manufacturer
  useEffect(() => {
    const list = filteredConsolesByManufacturer[selectedManufacturer] || [];
    if (list.length === 0) {
      setSelectedConsole('');
      return;
    }

    const exists = list.some((item) => item.value === selectedConsole);
    if (!exists) {
      setSelectedConsole(list[0].value);
    }
  }, [filteredConsolesByManufacturer, selectedManufacturer, selectedConsole]);

  const selectedConsoleDetail = useMemo(() => {
    const list = allConsoles[selectedManufacturer] || [];
    return list.find((item) => item.value === selectedConsole) || null;
  }, [allConsoles, selectedManufacturer, selectedConsole]);

  const officialColors = consoleColorOptions[selectedConsole] || [];
  const customColorList = customColors[selectedConsole] || [];
  const previewColors = useMemo(() => {
    const combined = [...officialColors, ...customColorList.map((c) => c.name)];
    const unique = Array.from(new Set(combined.filter(Boolean)));
    if (unique.length === 0) {
      return genericColors;
    }
    return unique;
  }, [officialColors, customColorList]);

  const handleSelectConsole = (consoleValue) => {
    setSelectedConsole(consoleValue);
    setEditingColorId(null);
    setNewColorName('');
    setNewColorReleaseDate('');
    setNewColorNotes('');
  };

  const handleAddCustomColor = () => {
    const name = newColorName.trim();
    if (!name) {
      alert('カラー名を入力してください');
      return;
    }

    const releaseDate = newColorReleaseDate.trim();
    const notes = newColorNotes.trim();

    const duplicateSource = [...officialColors, ...customColorList.map((c) => c.name)];
    if (duplicateSource.includes(name)) {
      alert('同じ名前のカラーが既に存在します');
      return;
    }

    const newEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name,
      releaseDate: releaseDate || '',
      notes: notes || '',
      createdAt: new Date().toISOString()
    };

    setCustomColors((prev) => ({
      ...prev,
      [selectedConsole]: [...(prev[selectedConsole] || []), newEntry]
    }));

    setNewColorName('');
    setNewColorReleaseDate('');
    setNewColorNotes('');
  };

  const handleStartEdit = (color) => {
    setEditingColorId(color.id);
    setEditingDraft({
      name: color.name,
      releaseDate: color.releaseDate || '',
      notes: color.notes || ''
    });
  };

  const handleCancelEdit = () => {
    setEditingColorId(null);
    setEditingDraft({
      name: '',
      releaseDate: '',
      notes: ''
    });
  };

  const handleSaveEdit = (colorId) => {
    const name = editingDraft.name.trim();
    if (!name) {
      alert('カラー名を入力してください');
      return;
    }

    const duplicateSource = [
      ...officialColors,
      ...customColorList.filter((c) => c.id !== colorId).map((c) => c.name)
    ];
    if (duplicateSource.includes(name)) {
      alert('同じ名前のカラーが既に存在します');
      return;
    }

    setCustomColors((prev) => ({
      ...prev,
      [selectedConsole]: (prev[selectedConsole] || []).map((color) =>
        color.id === colorId
          ? {
              ...color,
              name,
              releaseDate: editingDraft.releaseDate.trim(),
              notes: editingDraft.notes.trim(),
              updatedAt: new Date().toISOString()
            }
          : color
      )
    }));

    handleCancelEdit();
  };

  const handleDeleteCustomColor = (colorId) => {
    const target = customColorList.find((color) => color.id === colorId);
    if (!target) return;

    const confirmed = window.confirm(
      `「${target.name}」を削除しますか？この操作は元に戻せません。`
    );
    if (!confirmed) return;

    setCustomColors((prev) => {
      const updatedList = (prev[selectedConsole] || []).filter(
        (color) => color.id !== colorId
      );
      const next = { ...prev };
      if (updatedList.length === 0) {
        delete next[selectedConsole];
      } else {
        next[selectedConsole] = updatedList;
      }
      return next;
    });
  };

  const handleResetCustomColors = () => {
    if (!customColorList.length) {
      alert('この機種にはカスタムカラーが登録されていません');
      return;
    }

    const confirmed = window.confirm(
      'この機種に登録されたカスタムカラーをすべて削除しますか？'
    );
    if (!confirmed) return;

    setCustomColors((prev) => {
      const next = { ...prev };
      delete next[selectedConsole];
      return next;
    });
  };

  const handleCopyPreview = async () => {
    try {
      await navigator.clipboard.writeText(previewColors.join('\n'));
      alert('カラーリストをクリップボードにコピーしました');
    } catch (error) {
      console.error(error);
      alert('コピーに失敗しました');
    }
  };

  const renderManufacturerSection = (mfr) => {
    const consoles = filteredConsolesByManufacturer[mfr.value] || [];
    if (consoles.length === 0) return null;

    return (
      <div key={mfr.value} className="manufacturer-section">
        <div className="manufacturer-title">{mfr.label}</div>
        <div className="console-list">
          {consoles.map((console) => (
            <button
              key={console.value}
              className={`console-item ${
                selectedConsole === console.value ? 'active' : ''
              }`}
              onClick={() => {
                setSelectedManufacturer(mfr.value);
                handleSelectConsole(console.value);
              }}
            >
              <span className="console-label">{console.label}</span>
            </button>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="color-library-settings">
      <div className="page-header">
        <div>
          <h1>カラーライブラリ管理</h1>
          <p className="subtitle">
            機種ごとの公式カラーとカスタムカラーを確認・編集できます
          </p>
        </div>
      </div>

      <div className="color-settings-body">
        <aside className="color-settings-sidebar">
          <div className="sidebar-card">
            <label className="sidebar-label">機種検索</label>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="機種名や型番で検索"
            />
          </div>

          <div className="sidebar-list">
            {manufacturers.map((mfr) => renderManufacturerSection(mfr))}
          </div>
        </aside>

        <section className="color-settings-content">
          {!selectedConsoleDetail ? (
            <div className="empty-state">
              <div className="empty-icon">🔍</div>
              <p>該当する機種が見つかりません</p>
            </div>
          ) : (
            <>
              <div className="console-summary-card">
                <div>
                  <h2>{selectedConsoleDetail.label}</h2>
                  <p className="console-meta">
                    公式カラー {officialColors.length}件 / カスタムカラー{' '}
                    {customColorList.length}件
                  </p>
                </div>
                <div className="preview-actions">
                  <button
                    className="ghost-btn"
                    onClick={handleCopyPreview}
                    disabled={!previewColors.length}
                  >
                    一覧をコピー
                  </button>
                  <button
                    className="ghost-btn danger"
                    onClick={handleResetCustomColors}
                    disabled={!customColorList.length}
                  >
                    カスタムを全削除
                  </button>
                </div>
              </div>

              <div className="color-panel-grid">
                <div className="color-panel">
                  <div className="panel-header">
                    <h3>公式カラー</h3>
                    <span className="count-pill">{officialColors.length}</span>
                  </div>
                  {officialColors.length === 0 ? (
                    <p className="panel-empty">
                      公式カラー情報が登録されていません（汎用カラーが使用されます）
                    </p>
                  ) : (
                    <ul className="color-tag-list">
                      {officialColors.map((color) => (
                        <li key={color} className="color-tag official">
                          {color}
                        </li>
                      ))}
                    </ul>
                  )}
                  <p className="panel-caption">
                    公式カラーの内容はマスターデータから参照されています。
                  </p>
                </div>

                <div className="color-panel">
                  <div className="panel-header">
                    <h3>カスタムカラー</h3>
                    <span className="count-pill">{customColorList.length}</span>
                  </div>
                  {customColorList.length === 0 ? (
                    <p className="panel-empty">カスタムカラーは登録されていません</p>
                  ) : (
                    <ul className="custom-color-list">
                      {customColorList.map((color) => (
                        <li key={color.id} className="custom-color-item">
                          {editingColorId === color.id ? (
                            <div className="custom-color-edit">
                              <div className="edit-fields">
                                <input
                                  type="text"
                                  value={editingDraft.name}
                                  onChange={(e) =>
                                    setEditingDraft((prev) => ({
                                      ...prev,
                                      name: e.target.value
                                    }))
                                  }
                                  placeholder="カラー名"
                                />
                                <input
                                  type="text"
                                  value={editingDraft.releaseDate}
                                  onChange={(e) =>
                                    setEditingDraft((prev) => ({
                                      ...prev,
                                      releaseDate: e.target.value
                                    }))
                                  }
                                  placeholder="発売日・年代（任意）"
                                />
                                <textarea
                                  rows="2"
                                  value={editingDraft.notes}
                                  onChange={(e) =>
                                    setEditingDraft((prev) => ({
                                      ...prev,
                                      notes: e.target.value
                                    }))
                                  }
                                  placeholder="備考（任意）"
                                />
                              </div>
                              <div className="edit-actions">
                                <button
                                  className="primary-btn"
                                  onClick={() => handleSaveEdit(color.id)}
                                >
                                  保存
                                </button>
                                <button className="ghost-btn" onClick={handleCancelEdit}>
                                  キャンセル
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="custom-color-view">
                              <div>
                                <div className="color-name">{color.name}</div>
                                {(color.releaseDate || color.notes) && (
                                  <div className="color-meta">
                                    {color.releaseDate && (
                                      <span className="meta-item">{color.releaseDate}</span>
                                    )}
                                    {color.notes && (
                                      <span className="meta-item">{color.notes}</span>
                                    )}
                                  </div>
                                )}
                              </div>
                              <div className="item-actions">
                                <button
                                  className="ghost-btn"
                                  onClick={() => handleStartEdit(color)}
                                >
                                  編集
                                </button>
                                <button
                                  className="ghost-btn danger"
                                  onClick={() => handleDeleteCustomColor(color.id)}
                                >
                                  削除
                                </button>
                              </div>
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                  <p className="panel-caption">
                    カスタムカラーは既存の公式カラーには影響せず、フォームに追加で表示されます。
                  </p>
                </div>
              </div>

              <div className="add-color-card">
                <h3>カスタムカラーを追加</h3>
                <div className="add-color-form">
                  <div className="form-field">
                    <label>カラー名 *</label>
                    <input
                      type="text"
                      value={newColorName}
                      onChange={(e) => setNewColorName(e.target.value)}
                      placeholder="例: メタリックブルー（限定）"
                    />
                  </div>
                  <div className="form-field">
                    <label>発売日・年代（任意）</label>
                    <input
                      type="text"
                      value={newColorReleaseDate}
                      onChange={(e) => setNewColorReleaseDate(e.target.value)}
                      placeholder="例: 2024年11月 発売"
                    />
                  </div>
                  <div className="form-field">
                    <label>備考（任意）</label>
                    <textarea
                      rows="2"
                      value={newColorNotes}
                      onChange={(e) => setNewColorNotes(e.target.value)}
                      placeholder="限定版やセット内容などのメモ"
                    />
                  </div>
                </div>
                <div className="form-actions">
                  <button className="primary-btn" onClick={handleAddCustomColor}>
                    カラーを追加
                  </button>
                  <span className="form-hint">
                    追加したカラーは即座に買取フォームや販売画面に反映されます。
                  </span>
                </div>
              </div>

              <div className="preview-card">
                <div className="preview-header">
                  <h3>選択中のカラーリスト（プレビュー）</h3>
                  <span className="count-pill">{previewColors.length}</span>
                </div>
                <div className="preview-tags">
                  {previewColors.map((color) => (
                    <span key={color} className="preview-tag">
                      {color}
                    </span>
                  ))}
                </div>
                <p className="panel-caption">
                  上記リストが実際のフォームで表示される順序です（公式 → カスタムの順）。
                </p>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
};

export default ColorLibrarySettings;

