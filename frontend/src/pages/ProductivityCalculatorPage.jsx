import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Card, Table, Button, Space, InputNumber, Input, Typography, Popconfirm, message, Modal, Form, Select, Spin, Switch, Collapse, Tooltip } from 'antd';
import { PlusOutlined, DeleteOutlined, SaveOutlined, SettingOutlined, CloudDownloadOutlined, PlusCircleOutlined, MinusCircleOutlined } from '@ant-design/icons';
import MainLayout from '../components/MainLayout';
import * as theme from '../theme/constants';
import { credentialsAPI, emagAPI, platformsAPI, calculatorAPI } from '../api';

const { Title, Text } = Typography;

// Helper function to format numbers without unnecessary decimals
const formatNumber = (value, decimals = 2) => {
  if (value === null || value === undefined || isNaN(value)) return '0';
  const num = parseFloat(value);
  const formatted = num.toFixed(decimals);
  // Remove trailing zeros and decimal point if not needed
  return parseFloat(formatted).toString();
};

export default function ProductivityCalculatorPage() {
  const [products, setProducts] = useState([]);
  const [editingKey, setEditingKey] = useState('');
  const [electricityModalVisible, setElectricityModalVisible] = useState(false);
  const [electricityForm] = Form.useForm();
  const [electricitySettings, setElectricitySettings] = useState({
    printerConsumption: 0.12,
    electricityCost: 1.11,
    targetPrintRate: 22.00 // Target RON/oră (setare globală)
  });
  const [emagRomaniaCredential, setEmagRomaniaCredential] = useState(null);
  const [loading, setLoading] = useState(true);
  const [addProductModalVisible, setAddProductModalVisible] = useState(false);
  const [addProductForm] = Form.useForm();
  const [expandedRows, setExpandedRows] = useState([]);
  const [editingParts, setEditingParts] = useState({}); // { productKey: true/false }
  const [initialProductValues, setInitialProductValues] = useState({}); // { productKey: {...original values} }
  const [marketplaceSettings, setMarketplaceSettings] = useState([]); // Store marketplace settings to preserve them
  const [manualProducts, setManualProducts] = useState([]); // Store manual products to preserve them

  // Load products and settings from server on mount
  useEffect(() => {
    const loadCalculatorData = async () => {
      try {
        setLoading(true);
        const response = await calculatorAPI.getProducts();
        const data = response.data;
        
        if (data.products && data.products.length > 0) {
          setProducts(data.products);
        }
        
        if (data.electricity_settings) {
          setElectricitySettings(data.electricity_settings);
        }
        
        // Preserve marketplace settings and manual products
        if (data.marketplace_settings) {
          setMarketplaceSettings(data.marketplace_settings);
        }
        if (data.manual_products) {
          setManualProducts(data.manual_products);
        }
      } catch (error) {
        console.error('Failed to load calculator data:', error);
        // Fallback to empty state if server fails
      } finally {
        setLoading(false);
      }
    };
    
    loadCalculatorData();
  }, []);

  // Set form initial values when modal opens
  useEffect(() => {
    if (electricityModalVisible && electricityForm) {
      electricityForm.setFieldsValue(electricitySettings);
    }
  }, [electricityModalVisible, electricitySettings, electricityForm]);

  // Load eMAG credentials automatically on mount (România, Bulgaria, Ungaria)
  useEffect(() => {
    const loadEmagCredentials = async () => {
      try {
        const userId = localStorage.getItem('user_id');
        if (!userId) return;
        
        // Load platforms to find eMAG platform ID
        const platformsResponse = await platformsAPI.list();
        const platforms = platformsResponse.data || [];
        const emagPlatform = platforms.find(p => p.name === 'emag' || p.display_name === 'eMAG');
        const emagPlatformId = emagPlatform?.id || 1; // Default to 1 if not found
        
        // Load credentials
        const response = await credentialsAPI.list(userId);
        const allCredentials = response.data || [];
        
        // Filter eMAG credentials
        const emagCreds = allCredentials.filter(c => {
          const platformValue = c.platform || c.platform_id;
          return platformValue === emagPlatformId || 
                 platformValue === 'emag' || 
                 platformValue === 'EMAG' ||
                 platformValue === 1;
        });
        
        // Find eMAG România (not HU, not BG)
        const emagRomania = emagCreds.find(c => {
          const label = (c.account_label || '').toUpperCase();
          return !label.includes('HU') && 
                 !label.includes('HUNGARY') && 
                 !label.includes('UNGARIA') &&
                 !label.includes('EMAG.HU') &&
                 !label.includes('BG') &&
                 !label.includes('BULGARIA') &&
                 !label.includes('EMAG.BG');
        });
        
        if (emagRomania) {
          setEmagRomaniaCredential(emagRomania.id);
        }
      } catch (error) {
        console.error('Failed to load eMAG credentials:', error);
      }
    };
    loadEmagCredentials();
  }, []);

  // Save products to server whenever they change (debounced)
  useEffect(() => {
    if (!loading && products.length >= 0) {
      const timeoutId = setTimeout(async () => {
        try {
          // Preserve marketplace_settings and manual_products when saving
          await calculatorAPI.saveProducts(
            products, 
            electricitySettings,
            marketplaceSettings,
            manualProducts
          );
        } catch (error) {
          console.error('Failed to save products to server:', error);
          message.error('Failed to save products. Please try again.');
        }
      }, 1000); // Debounce: save 1 second after last change
      
      return () => clearTimeout(timeoutId);
    }
  }, [products, electricitySettings, marketplaceSettings, manualProducts, loading]);

  const calculateRow = useCallback((record) => {
    const {
      isMultipleParts = false,
      parts = [],
      printTime = 0,        // H - print time în minute
      stackSize = 1,         // I - stack size
      costMaterial = 0,      // J - cost material (TOTAL per print)
      packagingCost = 0,     // Cost ambalaj (per produs final)
      targetPerHour = 22,    // 🎯 Target lei/oră (valoare fixă, editabilă)
      pretEmag = 0,          // Prețul real din eMAG (hardcoded, editabil)
    } = record;

    const printerConsumption = electricitySettings.printerConsumption || 0.12; // kW
    const electricityCost = electricitySettings.electricityCost || 1.11; // lei/kWh
    // Folosește override-ul produsului dacă există, altfel folosește setarea globală
    const effectiveTargetPerHour = targetPerHour !== null && targetPerHour !== undefined 
      ? targetPerHour 
      : (electricitySettings.targetPrintRate || 22.00);

    // Dacă este produs cu multiple părți, fiecare parte este calculată independent
    if (isMultipleParts && parts && parts.length > 0) {
      let totalBestPrice = 0;
      let totalCostMaterialPerPiece = 0; // Suma costurilor materiale per piesă pentru toate părțile
      let totalElectricityPerPiece = 0; // Suma costurilor de electricitate per piesă pentru toate părțile
      let totalPrintTimePerPiece = 0; // Suma timpului per piesă pentru toate părțile (secvențial)
      let hasValidParts = false;
      
      // Pentru fiecare parte, calculăm independent: bestPrice, costuri
      // Părțile sunt printate secvențial, deci timpul total = suma timpului per piesă pentru fiecare parte
      parts.forEach(part => {
        const partPrintTime = part.printTime !== null && part.printTime !== undefined ? part.printTime : 0;
        const partStackSize = part.stackSize !== null && part.stackSize !== undefined ? part.stackSize : 1;
        const partCostMaterial = part.costMaterial !== null && part.costMaterial !== undefined ? part.costMaterial : 0;
        
        // Verificăm dacă partea are date valide
        if (partPrintTime > 0 || partCostMaterial > 0) {
          hasValidParts = true;
        }
        
        // Timp per piesă pentru această parte (platePrintTime / plateStackSize)
        const partTimePerPiece = partStackSize > 0 ? partPrintTime / partStackSize : 0;
        totalPrintTimePerPiece += partTimePerPiece;
        
        // Print per hour pentru această parte (folosit doar pentru calculul bestPrice per parte)
        const partPrintPerHour = partPrintTime > 0 ? (partStackSize * 60) / partPrintTime : 0;
        
        // Costuri per piesă pentru această parte
        const partCostMaterialPerPiece = partStackSize > 0 ? partCostMaterial / partStackSize : 0;
        totalCostMaterialPerPiece += partCostMaterialPerPiece;
        
        // Electricity pentru această parte
        const partElectricity = partPrintTime > 0 ? (partPrintTime / 60) * printerConsumption * electricityCost : 0;
        const partElectricityPerPiece = partStackSize > 0 ? partElectricity / partStackSize : 0;
        totalElectricityPerPiece += partElectricityPerPiece;
        
        // Best price pentru această parte (calculat independent) - FĂRĂ comision
        const partTargetPerPiece = partPrintPerHour > 0 ? effectiveTargetPerHour / partPrintPerHour : 0;
        const partBestPrice = partTargetPerPiece + partCostMaterialPerPiece + partElectricityPerPiece;
        
        // Adunăm bestPrice-urile pentru a obține prețul total
        totalBestPrice += partBestPrice;
      });

      if (!hasValidParts) {
        return {
          electricity: '0',
          printPerHour: '0',
          bestPrice: '0',
          targetPerHour: formatNumber(effectiveTargetPerHour, 2),
          profitPerPiece: '0',
          profitPerHour: '0',
        };
      }

      // Printed items/hour = 60 / (suma timpului per piesă pentru toate părțile)
      // Părțile sunt printate secvențial, deci timpul total = Σ(platePrintTime_part / plateStackSize_part)
      const printPerHour = totalPrintTimePerPiece > 0 ? 60 / totalPrintTimePerPiece : 0;
      
      // Costuri totale per piesă (suma tuturor părților)
      // totalCostMaterialPerPiece și totalElectricityPerPiece sunt deja calculate ca sume per piesă
      
      // Packaging cost per piesă (cost fix per produs final, nu per print)
      const effectivePackagingCost = packagingCost !== null && packagingCost !== undefined ? packagingCost : 0;
      
      // Best price trebuie să includă și packaging cost
      totalBestPrice += effectivePackagingCost;

      // Profit REAL per piesă = pretEmag - totalCostMaterialPerPiece - totalElectricityPerPiece - packagingCost
      // Profit contabil real: cât îți rămâne în mână după costuri (FĂRĂ target, FĂRĂ comision)
      const effectivePretEmag = pretEmag !== null && pretEmag !== undefined ? pretEmag : 0;
      const profitPerPiece = effectivePretEmag > 0
        ? effectivePretEmag - totalCostMaterialPerPiece - totalElectricityPerPiece - effectivePackagingCost
        : 0;

      // Profit per hour = profitPerPiece * printPerHour
      const profitPerHour = profitPerPiece * printPerHour;

      return {
        electricity: formatNumber(totalElectricityPerPiece, 2), // Suma costurilor de electricitate per piesă pentru toate părțile
        printPerHour: formatNumber(printPerHour, 2),
        bestPrice: formatNumber(totalBestPrice, 2), // Suma bestPrice-urilor pentru toate părțile
        targetPerHour: formatNumber(effectiveTargetPerHour, 2),
        profitPerPiece: formatNumber(profitPerPiece, 2),
        profitPerHour: formatNumber(profitPerHour, 2),
      };
    }

    // Produs simplu (logica existentă)
    // Tratăm valorile null
    const effectivePrintTime = printTime !== null && printTime !== undefined ? printTime : 0;
    const effectiveStackSize = stackSize !== null && stackSize !== undefined ? stackSize : 1;
    const effectiveCostMaterial = costMaterial !== null && costMaterial !== undefined ? costMaterial : 0;
    
    // 1. Electricity cost (per print) = (print time / 60) * printerConsumption * electricityCost
    const electricity = effectivePrintTime > 0 ? (effectivePrintTime / 60) * printerConsumption * electricityCost : 0;
    
    // 2. Print per hour = stack size * 60 / print time
    const printPerHour = effectivePrintTime > 0 ? (effectiveStackSize * 60) / effectivePrintTime : 0;
    
    // 3. Cost per piesă (doar costuri reale, FĂRĂ target)
    const costMaterialPerPiece = effectiveStackSize > 0 ? effectiveCostMaterial / effectiveStackSize : 0;
    const electricityPerPiece = effectiveStackSize > 0 ? electricity / effectiveStackSize : 0;
    
    // Packaging cost per piesă (cost fix per produs final, nu per print)
    const effectivePackagingCost = packagingCost !== null && packagingCost !== undefined ? packagingCost : 0;
    
    // 4. Best price = targetRONperHour / printPerHour + costMaterialPerPiece + electricityPerPiece + packagingCost
    // Cel mai bun preț de vânzare pentru a atinge target-ul de profit pe oră (FĂRĂ comision)
    // effectiveTargetPerHour este deja declarat la începutul funcției
    const targetPerPieceForPricing = printPerHour > 0 ? effectiveTargetPerHour / printPerHour : 0;
    const bestPrice = targetPerPieceForPricing + costMaterialPerPiece + electricityPerPiece + effectivePackagingCost;

    // 5. Profit REAL per piesă = pretEmag - costMaterialPerPiece - electricityPerPiece - packagingCost
    // Profit contabil real: cât îți rămâne în mână după costuri (FĂRĂ target, FĂRĂ comision)
    const effectivePretEmag = pretEmag !== null && pretEmag !== undefined ? pretEmag : 0;
    const profitPerPiece = effectivePretEmag > 0
      ? effectivePretEmag - costMaterialPerPiece - electricityPerPiece - effectivePackagingCost
      : 0;

    // 6. Profit per hour = profitPerPiece * printPerHour
    const profitPerHour = profitPerPiece * printPerHour;

      return {
        electricity: formatNumber(electricity, 2),
        printPerHour: formatNumber(printPerHour, 2),
        bestPrice: formatNumber(bestPrice, 2),
        targetPerHour: formatNumber(effectiveTargetPerHour, 2),
        profitPerPiece: formatNumber(profitPerPiece, 2),
        profitPerHour: formatNumber(profitPerHour, 2),
      };
  }, [electricitySettings]);

  const addNewRow = useCallback(() => {
    setAddProductModalVisible(true);
    addProductForm.resetFields();
    addProductForm.setFieldsValue({ isMultipleParts: false });
  }, [addProductForm]);

  const handleAddProduct = useCallback((values) => {
    const { isMultipleParts, productName, sku, targetPerHour } = values;
    const newProduct = {
      key: Date.now().toString(),
      productName: productName || '',
      sku: sku || '',
      isMultipleParts: isMultipleParts || false,
      targetPerHour: targetPerHour !== null && targetPerHour !== undefined ? targetPerHour : null, // null = folosește setarea globală
      pretEmag: 0, // Prețul real din eMAG România (hardcoded, editabil)
    };

    if (isMultipleParts) {
      // Produs cu multiple părți - inițializăm cu o parte goală
      newProduct.parts = [{
        key: Date.now().toString() + '-part-0',
        partName: '',
        printTime: null,
        stackSize: null,
        costMaterial: null,
      }];
    } else {
      // Produs simplu - fără valori default
      newProduct.printTime = null;
      newProduct.stackSize = null;
      newProduct.costMaterial = null;
      newProduct.packagingCost = null;
    }

    setProducts(prev => [...prev, newProduct]);
    setAddProductModalVisible(false);
    setEditingKey(newProduct.key);
    message.success('Product added successfully');
  }, []);

  const handleCellChange = useCallback((recordKey, dataIndex, value) => {
    // Salvează modificările doar dacă suntem în modul de editare
    // Aceste modificări vor fi aplicate permanent doar când se dă Save
    if (editingKey === recordKey) {
      setProducts(prev => prev.map(item => {
        if (item.key === recordKey) {
          return { ...item, [dataIndex]: value };
        }
        return item;
      }));
    }
  }, [editingKey]);

  const handlePartChange = useCallback((productKey, partKey, field, value) => {
    // Salvează modificările doar dacă suntem în modul de editare
    // Aceste modificări vor fi aplicate permanent doar când se dă Save
    if (editingKey === productKey) {
      setProducts(prev => prev.map(item => {
        if (item.key === productKey && item.isMultipleParts && item.parts) {
          return {
            ...item,
            parts: item.parts.map(part => {
              if (part.key === partKey) {
                return { ...part, [field]: value };
              }
              return part;
            })
          };
        }
        return item;
      }));
    }
  }, [editingKey]);

  const addPart = useCallback((productKey) => {
    setProducts(prev => prev.map(item => {
      if (item.key === productKey && item.isMultipleParts) {
        const newPart = {
          key: Date.now().toString() + '-part-' + (item.parts?.length || 0),
          partName: '',
          printTime: null,
          stackSize: null,
          costMaterial: null,
        };
        return {
          ...item,
          parts: [...(item.parts || []), newPart]
        };
      }
      return item;
    }));
  }, []);

  const removePart = useCallback((productKey, partKey) => {
    setProducts(prev => prev.map(item => {
      if (item.key === productKey && item.isMultipleParts && item.parts) {
        const newParts = item.parts.filter(part => part.key !== partKey);
        if (newParts.length === 0) {
          // Dacă nu mai sunt părți, ștergem produsul
          return null;
        }
        return { ...item, parts: newParts };
      }
      return item;
    }).filter(Boolean));
  }, []);

  const fetchAllEmagPrices = useCallback(async () => {
    if (!emagRomaniaCredential) {
      message.warning('eMAG România credential not found. Please add one in Settings.');
      return;
    }
    
    // Filtrează produsele care au SKU
    const productsWithSku = products.filter(p => p.sku && p.sku.trim() !== '');
    
    if (productsWithSku.length === 0) {
      message.warning('No products with SKU found. Please add SKU to products first.');
      return;
    }
    
    const hide = message.loading({ 
      content: `Fetching prices for ${productsWithSku.length} product(s)...`, 
      key: 'fetchAllPrices',
      duration: 0 
    });
    
    let successCount = 0;
    let errorCount = 0;
    
    try {
      // Fetch prices pentru toate produsele în paralel
      const promises = productsWithSku.map(async (product) => {
        try {
          const response = await emagAPI.getProductPrice(product.sku, emagRomaniaCredential);
          const price = response.data.price;
          if (price !== null && price !== undefined) {
            handleCellChange(product.key, 'pretEmag', price);
            successCount++;
          } else {
            errorCount++;
          }
        } catch (error) {
          console.error(`Failed to fetch price for SKU ${product.sku}:`, error);
          errorCount++;
        }
      });
      
      await Promise.all(promises);
      
      hide();
      
      if (successCount > 0) {
        message.success({ 
          content: `Successfully fetched ${successCount} price(s)${errorCount > 0 ? `, ${errorCount} failed` : ''}`, 
          key: 'fetchAllPrices',
          duration: 3
        });
      } else {
        message.error({ 
          content: 'Failed to fetch any prices. Please check SKUs and credentials.', 
          key: 'fetchAllPrices',
          duration: 5
        });
      }
    } catch (error) {
      hide();
      console.error('Failed to fetch eMAG prices:', error);
      message.error({ 
        content: 'Failed to fetch prices from eMAG România', 
        key: 'fetchAllPrices',
        duration: 5
      });
    }
  }, [emagRomaniaCredential, products, handleCellChange]);

  const deleteRow = useCallback((key) => {
    setProducts(prev => prev.filter(item => item.key !== key));
    message.success('Product deleted');
  }, []);

  const isEditing = useCallback((record) => record.key === editingKey, [editingKey]);

  const edit = useCallback((record) => {
    // Salvează valorile inițiale ale produsului înainte de editare
    setInitialProductValues(prev => ({
      ...prev,
      [record.key]: JSON.parse(JSON.stringify(record)) // Deep copy
    }));
    setEditingKey(record.key);
    // Expandă automat rândul dacă este produs cu multiple parts
    if (record.isMultipleParts && !expandedRows.includes(record.key)) {
      setExpandedRows(prev => [...prev, record.key]);
    }
  }, [expandedRows]);

  const cancel = useCallback(() => {
    if (editingKey && initialProductValues[editingKey]) {
      // Resetează produsul la valorile inițiale
      setProducts(prev => prev.map(item => {
        if (item.key === editingKey) {
          return initialProductValues[editingKey];
        }
        return item;
      }));
    }
    setEditingKey('');
    setInitialProductValues(prev => {
      const newState = { ...prev };
      delete newState[editingKey];
      return newState;
    });
  }, [editingKey, initialProductValues]);

  // Listen for Escape key to cancel editing
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape' && editingKey) {
        cancel();
      }
    };

    if (editingKey) {
      window.addEventListener('keydown', handleKeyDown);
      return () => {
        window.removeEventListener('keydown', handleKeyDown);
      };
    }
  }, [editingKey, cancel]);

  const save = useCallback((key) => {
    setEditingKey('');
    setEditingParts(prev => {
      const newState = { ...prev };
      delete newState[key];
      return newState;
    });
    // Șterge valorile inițiale salvate după salvare
    setInitialProductValues(prev => {
      const newState = { ...prev };
      delete newState[key];
      return newState;
    });
    message.success('Product saved');
  }, []);

  const editParts = useCallback((productKey) => {
    setEditingParts(prev => ({ ...prev, [productKey]: true }));
  }, []);

  const saveParts = useCallback((productKey) => {
    setEditingParts(prev => {
      const newState = { ...prev };
      delete newState[productKey];
      return newState;
    });
    message.success('Parts saved');
  }, []);

  const cancelParts = useCallback((productKey) => {
    setEditingParts(prev => {
      const newState = { ...prev };
      delete newState[productKey];
      return newState;
    });
  }, []);

  const EditableCell = React.memo(({ editing, dataIndex, title, record, children, inputType = 'text', ...restProps }) => {
    if (!record || !dataIndex) {
      return <td {...restProps}>{children}</td>;
    }
    
    const [localValue, setLocalValue] = useState(record[dataIndex] !== undefined ? record[dataIndex] : '');
    const inputRef = useRef(null);
    
    // Sync local value when record changes (but only if not currently editing this cell)
    useEffect(() => {
      if (!editing) {
        setLocalValue(record[dataIndex] !== undefined ? record[dataIndex] : '');
      }
    }, [record[dataIndex], editing, dataIndex]);
    
    const handleBlur = () => {
      if (record && record.key) {
        handleCellChange(record.key, dataIndex, localValue);
      }
    };
    
    const handleKeyPress = (e) => {
      if (e.key === 'Enter') {
        if (record && record.key) {
          handleCellChange(record.key, dataIndex, localValue);
        }
        if (inputRef.current) {
          inputRef.current.blur();
        }
      }
    };
    
    return (
      <td {...restProps}>
        {editing ? (
          inputType === 'number' || inputType === 'decimal' ? (
            <InputNumber
              style={{ width: '100%' }}
              min={0}
              step={inputType === 'decimal' ? 0.01 : 1}
              precision={inputType === 'decimal' ? 2 : 0}
              value={localValue !== '' && localValue !== undefined && localValue !== null ? localValue : undefined}
              onChange={(value) => {
                setLocalValue(value !== null && value !== undefined ? value : '');
              }}
              onBlur={handleBlur}
              onPressEnter={handleKeyPress}
            />
          ) : (
            <Input
              ref={inputRef}
              style={{ width: '100%' }}
              value={localValue || ''}
              onChange={(e) => {
                setLocalValue(e.target.value);
              }}
              onBlur={handleBlur}
              onPressEnter={handleKeyPress}
            />
          )
        ) : (
          children
        )}
      </td>
    );
  }, (prevProps, nextProps) => {
    // Custom comparison to prevent unnecessary re-renders
    return (
      prevProps.editing === nextProps.editing &&
      prevProps.dataIndex === nextProps.dataIndex &&
      prevProps.record?.key === nextProps.record?.key &&
      prevProps.record?.[prevProps.dataIndex] === nextProps.record?.[prevProps.dataIndex]
    );
  });

  // Component pentru editarea părților (similar cu EditableCell, dar pentru parts)
  const EditablePartCell = React.memo(({ editing, dataIndex, partRecord, productKey, inputType = 'text', min, step, precision, ...restProps }) => {
    if (!partRecord || !dataIndex) {
      return <td {...restProps}><span>{partRecord?.[dataIndex] !== null && partRecord?.[dataIndex] !== undefined ? partRecord[dataIndex] : <span style={{ color: '#999' }}>—</span>}</span></td>;
    }
    
    const [localValue, setLocalValue] = useState(partRecord[dataIndex] !== undefined ? partRecord[dataIndex] : '');
    const inputRef = useRef(null);
    
    // Sync local value when partRecord changes (but only if not currently editing this cell)
    useEffect(() => {
      if (!editing) {
        setLocalValue(partRecord[dataIndex] !== undefined ? partRecord[dataIndex] : '');
      }
    }, [partRecord[dataIndex], editing, dataIndex]);
    
    const handleBlur = () => {
      if (partRecord && partRecord.key && productKey) {
        handlePartChange(productKey, partRecord.key, dataIndex, localValue);
      }
    };
    
    const handleKeyPress = (e) => {
      if (e.key === 'Enter') {
        if (partRecord && partRecord.key && productKey) {
          handlePartChange(productKey, partRecord.key, dataIndex, localValue);
        }
        if (inputRef.current) {
          inputRef.current.blur();
        }
      }
    };
    
    return (
      <td {...restProps}>
        {editing ? (
          inputType === 'number' || inputType === 'decimal' ? (
            <InputNumber
              style={{ width: '100%' }}
              min={min !== undefined ? min : 0}
              step={step !== undefined ? step : (inputType === 'decimal' ? 0.01 : 1)}
              precision={precision !== undefined ? precision : (inputType === 'decimal' ? 2 : 0)}
              value={localValue !== '' && localValue !== undefined && localValue !== null ? localValue : undefined}
              onChange={(value) => {
                setLocalValue(value !== null && value !== undefined ? value : '');
              }}
              onBlur={handleBlur}
              onPressEnter={handleKeyPress}
              placeholder="—"
            />
          ) : (
            <Input
              ref={inputRef}
              style={{ width: '100%' }}
              value={localValue || ''}
              onChange={(e) => {
                setLocalValue(e.target.value);
              }}
              onBlur={handleBlur}
              onPressEnter={handleKeyPress}
              placeholder="Part name"
            />
          )
        ) : (
          <span>{partRecord[dataIndex] !== null && partRecord[dataIndex] !== undefined ? (inputType === 'decimal' ? formatNumber(partRecord[dataIndex], 2) : partRecord[dataIndex]) : <span style={{ color: '#999' }}>—</span>}</span>
        )}
      </td>
    );
  }, (prevProps, nextProps) => {
    // Custom comparison to prevent unnecessary re-renders
    return (
      prevProps.editing === nextProps.editing &&
      prevProps.dataIndex === nextProps.dataIndex &&
      prevProps.partRecord?.key === nextProps.partRecord?.key &&
      prevProps.partRecord?.[prevProps.dataIndex] === nextProps.partRecord?.[nextProps.dataIndex] &&
      prevProps.productKey === nextProps.productKey
    );
  });

  const columns = useMemo(() => [
    {
      title: (
        <Tooltip title="The name of the product. This is the main identifier for the product in the calculator.">
          <span>Object</span>
        </Tooltip>
      ),
      dataIndex: 'productName',
      key: 'productName',
      width: 300,
      editable: true,
      render: (text, record) => {
        const productName = text || '';
        const sku = record.sku || '';
        const content = (
          <span>
            {productName}
            {sku && (
              <span style={{ color: '#999', marginLeft: '8px', fontSize: '14px' }}>
                ({sku})
              </span>
            )}
          </span>
        );
        if (record.isMultipleParts) {
          return <strong style={{ color: theme.COLORS.primary }}>{content}</strong>;
        }
        return <strong style={{ color: theme.COLORS.text?.body || '#1f2937', fontWeight: 600 }}>{content}</strong>;
      },
    },
    {
      title: (
        <Tooltip title="Indicates if the product consists of multiple parts that are printed sequentially. For multiple parts products, each part has its own print time, stack size, and material cost.">
          <span>Multiple Parts</span>
        </Tooltip>
      ),
      key: 'isMultipleParts',
      width: 120,
      align: 'center',
      render: (_, record) => (
        record.isMultipleParts ? (
          <span style={{ color: theme.COLORS.primary, fontWeight: 600 }}>Yes ({record.parts?.length || 0})</span>
        ) : (
          <span style={{ color: '#999' }}>No</span>
        )
      ),
    },
    {
      title: (
        <Tooltip title="The minimum viable selling price to achieve the target print rate per hour. Calculated as: Target per piece + Material Cost per piece + Electricity Cost per piece + Packaging Cost per piece. For multiple parts products, this is the sum of best prices for all parts plus packaging cost.">
          <span>Best Price (RON)</span>
        </Tooltip>
      ),
      key: 'bestPrice',
      width: 190,
      align: 'center',
      render: (_, record) => {
        const calc = calculateRow(record);
        return <strong style={{ color: theme.COLORS.text.muted || '#64748b', fontSize: '16px' }}>{calc.bestPrice}</strong>;
      },
    },
    {
      title: (
        <Tooltip title="The current selling price on eMAG Romania. This price is fetched automatically from the eMAG API using the product's SKU. It cannot be edited manually.">
          <span>EMAG RO Price (RON)</span>
        </Tooltip>
      ),
      dataIndex: 'pretEmag',
      key: 'pretEmag',
      width: 210,
      editable: false, // Nu este editabil - se preia doar de pe eMAG
      inputType: 'decimal',
      align: 'center',
      render: (value) => (
        <span style={{ fontSize: '15px' }}>{formatNumber(value || 0, 2)}</span>
      ),
    },
    {
      title: (
        <Tooltip title="Real profit per item after all costs. Calculated as: EMAG RO Price - Material Cost per piece - Electricity Cost per piece - Packaging Cost per piece. This represents the actual accounting profit, not a target.">
          <span>Profit/item (RON)</span>
        </Tooltip>
      ),
      key: 'profitPerPiece',
      width: 190,
      align: 'center',
      render: (_, record) => {
        const calc = calculateRow(record);
        const profit = parseFloat(calc.profitPerPiece);
        return (
          <span style={{ 
            fontSize: '15px', 
            fontWeight: 600,
            color: profit >= 0 ? theme.COLORS.success || '#52c41a' : theme.COLORS.error || '#ff4d4f'
          }}>
            {calc.profitPerPiece}
          </span>
        );
      },
    },
    {
      title: (
        <Tooltip title="Real profit per hour. Calculated as: Profit/item * Printed items/hour. This shows the actual profit rate based on current selling price and production speed.">
          <span>Profit/hour (RON)</span>
        </Tooltip>
      ),
      key: 'profitPerHour',
      width: 190,
      align: 'center',
      render: (_, record) => {
        const calc = calculateRow(record);
        const profit = parseFloat(calc.profitPerHour);
        return (
          <span style={{ 
            fontSize: '15px', 
            fontWeight: 600,
            color: profit >= 0 ? theme.COLORS.success || '#52c41a' : theme.COLORS.error || '#ff4d4f'
          }}>
            {calc.profitPerHour}
          </span>
        );
      },
    },
    {
      title: (
        <Tooltip title="Number of complete items printed per hour. For single-part products: (Plate Stack Size * 60) / Plate Print Time. For multiple parts products: 60 / (Sum of (Plate Print Time / Plate Stack Size) for all parts), since parts are printed sequentially.">
          <span>Printed items/hour</span>
        </Tooltip>
      ),
      key: 'printPerHour',
      width: 190,
      align: 'center',
      render: (_, record) => {
        const calc = calculateRow(record);
        return <span style={{ color: theme.COLORS.text.body, fontSize: '15px' }}>{calc.printPerHour}</span>;
      },
    },
    {
      title: (
        <Tooltip title="Total electricity cost per item. Calculated as: (Plate Print Time / 60) * Printer Consumption (kW) * Electricity Cost (lei/kWh) / Plate Stack Size. For multiple parts products, this is the sum of electricity costs per piece for all parts.">
          <span>Electricity Cost (RON)</span>
        </Tooltip>
      ),
      key: 'electricity',
      width: 160,
      align: 'center',
      render: (_, record) => {
        const calc = calculateRow(record);
        return <span style={{ color: theme.COLORS.text.body, fontSize: '15px' }}>{calc.electricity}</span>;
      },
    },
    {
      title: (
        <Tooltip title="Target profit rate in RON per hour. This is a global setting that can be overridden per product. Used to calculate the 'Best Price'. If not set for a product, the global setting from Settings is used.">
          <span>Target Print Rate (RON/H)</span>
        </Tooltip>
      ),
      dataIndex: 'targetPerHour',
      key: 'targetPerHour',
      width: 190,
      editable: true,
      inputType: 'decimal',
      align: 'center',
      render: (value, record) => {
        // Dacă nu există override, afișează setarea globală
        const displayValue = value !== null && value !== undefined 
          ? value 
          : (electricitySettings.targetPrintRate || 22.00);
        return (
          <span style={{ fontSize: '15px', fontWeight: 600 }}>
            {formatNumber(displayValue, 2)}
            {value === null || value === undefined ? (
              <span style={{ fontSize: '11px', color: '#999', marginLeft: '4px' }}>(global)</span>
            ) : null}
          </span>
        );
      },
    },
    {
      title: (
        <Tooltip title="Total print time in minutes for one plate. For multiple parts products, this is not applicable at the product level - each part has its own print time.">
          <span>Plate Print Time</span>
        </Tooltip>
      ),
      dataIndex: 'printTime',
      key: 'printTime',
      width: 150,
      editable: (record) => !record.isMultipleParts,
      inputType: 'number',
      align: 'center',
      render: (value, record) => {
        if (record.isMultipleParts) {
          return <span style={{ fontSize: '15px', color: '#999' }}>—</span>;
        }
        return <span style={{ fontSize: '15px' }}>{value || 0}</span>;
      },
    },
    {
      title: (
        <Tooltip title="Number of items that can be printed on one plate. Used to calculate cost per piece and items per hour. For multiple parts products, this is not applicable at the product level - each part has its own stack size.">
          <span>Plate Stack Size</span>
        </Tooltip>
      ),
      dataIndex: 'stackSize',
      key: 'stackSize',
      width: 150,
      editable: (record) => !record.isMultipleParts,
      inputType: 'number',
      align: 'center',
      render: (value, record) => {
        if (record.isMultipleParts) {
          return <span style={{ fontSize: '15px', color: '#999' }}>—</span>;
        }
        return <span style={{ fontSize: '15px' }}>{value || 1}</span>;
      },
    },
    {
      title: (
        <Tooltip title="Total material cost for one plate. The cost per piece is calculated as: Material Cost / Plate Stack Size. For multiple parts products, this is the sum of (Material Cost / Plate Stack Size) for all parts.">
          <span>Material Cost</span>
        </Tooltip>
      ),
      dataIndex: 'costMaterial',
      key: 'costMaterial',
      width: 190,
      editable: (record) => !record.isMultipleParts,
      inputType: 'decimal',
      align: 'center',
      render: (value, record) => {
        if (record.isMultipleParts) {
          // Pentru produse cu multiple parts, calculăm suma costurilor materiale per piesă
          if (record.parts && record.parts.length > 0) {
            let totalCostMaterialPerPiece = 0;
            record.parts.forEach(part => {
              const partCostMaterial = part.costMaterial !== null && part.costMaterial !== undefined ? part.costMaterial : 0;
              const partStackSize = part.stackSize !== null && part.stackSize !== undefined ? part.stackSize : 1;
              const partCostMaterialPerPiece = partStackSize > 0 ? partCostMaterial / partStackSize : 0;
              totalCostMaterialPerPiece += partCostMaterialPerPiece;
            });
            return <span style={{ fontSize: '15px' }}>{formatNumber(totalCostMaterialPerPiece, 2)}</span>;
          }
          return <span style={{ fontSize: '15px', color: '#999' }}>—</span>;
        }
        return <span style={{ fontSize: '15px' }}>{formatNumber(value || 0, 2)}</span>;
      },
    },
    {
      title: (
        <Tooltip title="Packaging cost per product (carton, plastic bags, etc.). This is a fixed cost per final product, not per print. Editable for all products, including those with multiple parts.">
          <span>Packaging Costs (RON)</span>
        </Tooltip>
      ),
      dataIndex: 'packagingCost',
      key: 'packagingCost',
      width: 200,
      editable: true, // Editabil pentru toate produsele, inclusiv cele cu multiple parts
      inputType: 'decimal',
      align: 'center',
      render: (value) => <span style={{ fontSize: '15px' }}>{formatNumber(value || 0, 2)}</span>,
    },
    {
      title: (
        <Tooltip title="Available actions for the product: Edit (to modify product details), Delete (to remove the product from the calculator). For multiple parts products, clicking Edit will also expand the row to show parts.">
          <span>Actions</span>
        </Tooltip>
      ),
      key: 'actions',
      width: 180,
      render: (_, record) => {
        const editable = isEditing(record);
        return editable ? (
          <Space>
            <Button
              type="primary"
              onClick={() => save(record.key)}
              size="small"
              icon={<SaveOutlined />}
            >
              Save
            </Button>
            <Button
              onClick={cancel}
              size="small"
            >
              Cancel
            </Button>
          </Space>
        ) : (
          <Space>
            <Button
              type="link"
              onClick={() => edit(record)}
              size="small"
            >
              Edit
            </Button>
            <Popconfirm
              title="Delete this product?"
              onConfirm={() => deleteRow(record.key)}
              okText="Yes"
              cancelText="No"
            >
              <Button
                type="link"
                danger
                size="small"
                icon={<DeleteOutlined />}
              >
                Delete
              </Button>
            </Popconfirm>
          </Space>
        );
      },
    },
  ], [calculateRow, isEditing, edit, save, cancel, deleteRow, handleCellChange]);
  
  const mergedColumns = useMemo(() => {
    return columns.map((col) => {
      // Verifică dacă coloana este editabilă (poate fi boolean sau funcție)
      const isEditable = typeof col.editable === 'function' 
        ? (record) => col.editable(record)
        : col.editable;
      
      if (!isEditable) {
        return col;
      }
      return {
        ...col,
        onCell: (record) => {
          // Verifică dacă această coloană este editabilă pentru acest record
          const editable = typeof col.editable === 'function' 
            ? col.editable(record)
            : col.editable;
          
          if (!editable) {
            return { record };
          }
          
          return {
            record,
            inputType: col.inputType || 'text',
            dataIndex: col.dataIndex,
            title: col.title,
            editing: isEditing(record),
          };
        },
      };
    });
  }, [columns, editingKey, isEditing]);

  return (
    <MainLayout currentKey="calculator">
      <style>
        {`
          .ant-layout-content.content-area {
            max-width: 2800px !important;
          }
          .productivity-table .ant-table-tbody > tr > td {
            padding: 8px 12px !important;
            font-size: 15px !important;
          }
          .productivity-table .ant-table-thead > tr > th {
            padding: 10px 12px !important;
            background: ${theme.COLORS.primaryLight} !important;
            font-weight: 600 !important;
            font-size: 16px !important;
          }
          .productivity-table .ant-table-tbody > tr:hover > td {
            background: ${theme.COLORS.primaryLight} !important;
          }
          .productivity-table .ant-table-wrapper {
            overflow-x: auto;
          }
          .productivity-table input,
          .productivity-table .ant-input-number {
            border: 1px solid ${theme.COLORS.border} !important;
            font-size: 15px !important;
            padding: 4px 8px !important;
          }
          .productivity-table input:focus,
          .productivity-table .ant-input-number:focus {
            border-color: ${theme.COLORS.primary} !important;
            box-shadow: 0 0 0 2px ${theme.COLORS.primaryLight} !important;
          }
          .productivity-table .ant-btn {
            font-size: 14px !important;
            padding: 4px 12px !important;
          }
        `}
      </style>
      <div style={{ width: '100%', margin: '0 auto', padding: `${theme.SPACING.md * 1.5}px` }}>
        <Card
          title={
            <Space>
              <Title level={4} style={{ margin: 0, fontSize: '24px', fontWeight: 600 }}>
                Print costs
              </Title>
            </Space>
          }
          style={theme.CARD_STYLES.base}
          styles={{
            header: {
              ...theme.CARD_STYLES.head,
              padding: `${theme.SPACING.md * 1.5}px ${theme.SPACING.lg * 1.5}px`
            },
            body: {
              ...theme.CARD_STYLES.body,
              padding: `${theme.SPACING.lg * 1.5}px`
            }
          }}
          extra={
            <Space>
              <Button
                icon={<SettingOutlined />}
                onClick={() => setElectricityModalVisible(true)}
                style={{
                  fontSize: '15px',
                  padding: '6px 16px',
                  height: 'auto'
                }}
              >
                Settings
              </Button>
              <Button
                icon={<CloudDownloadOutlined />}
                onClick={fetchAllEmagPrices}
                style={{
                  fontSize: '15px',
                  padding: '6px 16px',
                  height: 'auto'
                }}
              >
                Fetch Prices
              </Button>
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={addNewRow}
                style={{
                  ...theme.BUTTON_STYLES.primary,
                  fontSize: '15px',
                  padding: '6px 21px',
                  height: 'auto'
                }}
              >
                Add Product
              </Button>
            </Space>
          }
        >
          <Spin spinning={loading}>
            <Table
              className="productivity-table"
              components={{
                body: {
                  cell: EditableCell,
                },
              }}
              columns={mergedColumns}
              dataSource={products}
              rowKey="key"
              pagination={false}
              locale={theme.TABLE_CONFIG.locale}
              style={theme.TABLE_CONFIG.tableStyle}
              rowClassName={() => theme.TABLE_CONFIG.rowClassName}
              size="small"
              expandable={{
                expandedRowKeys: expandedRows,
                onExpandedRowsChange: setExpandedRows,
                expandedRowRender: (record) => {
                  if (!record.isMultipleParts || !record.parts || record.parts.length === 0) {
                    return null;
                  }
                  
                  // Parts-urile sunt în modul de editare când produsul este în modul de editare
                  const isEditingParts = editingKey === record.key;
                  
                  // Structură tabel părți: coloană dummy pentru expand + Part Name (în dreptul Object) + coloane cu "-" + coloane reale pentru părți
                  const partColumns = [
                    // Coloană dummy pentru a compensa coloana de expand din tabelul principal
                    {
                      title: '',
                      key: 'dummy-expand',
                      width: 56, // Lățimea coloanei de expand
                      render: () => null,
                    },
                    {
                      title: (
                        <Tooltip title="The name of the part. Each part in a multiple parts product has its own print time, stack size, and material cost.">
                          <span>Part Name</span>
                        </Tooltip>
                      ),
                      dataIndex: 'partName',
                      key: 'partName',
                      width: 250, // Aceeași lățime ca "Object"
                      render: (text, partRecord) => (
                        <EditablePartCell
                          editing={isEditingParts}
                          dataIndex="partName"
                          partRecord={partRecord}
                          productKey={record.key}
                          inputType="text"
                        />
                      ),
                    },
                    {
                      title: (
                        <Tooltip title="Indicates if the product consists of multiple parts that are printed sequentially. For multiple parts products, each part has its own print time, stack size, and material cost.">
                          <span>Multiple Parts</span>
                        </Tooltip>
                      ),
                      key: 'dummy-multiple',
                      width: 120,
                      align: 'center',
                      render: () => <span style={{ color: '#999' }}>—</span>,
                    },
                    {
                      title: (
                        <Tooltip title="The minimum viable selling price to achieve the target print rate per hour. Calculated as: Target per piece + Material Cost per piece + Electricity Cost per piece + Packaging Cost per piece. For multiple parts products, this is the sum of best prices for all parts plus packaging cost.">
                          <span>Best Price (RON)</span>
                        </Tooltip>
                      ),
                      key: 'dummy-best-price',
                      width: 190,
                      align: 'center',
                      render: () => <span style={{ color: '#999' }}>—</span>,
                    },
                    {
                      title: (
                        <Tooltip title="The current selling price on eMAG Romania. This price is fetched automatically from the eMAG API using the product's SKU. It cannot be edited manually.">
                          <span>EMAG RO Price (RON)</span>
                        </Tooltip>
                      ),
                      key: 'dummy-emag-price',
                      width: 210,
                      align: 'center',
                      render: () => <span style={{ color: '#999' }}>—</span>,
                    },
                    {
                      title: (
                        <Tooltip title="Real profit per item after all costs. Calculated as: EMAG RO Price - Material Cost per piece - Electricity Cost per piece - Packaging Cost per piece. This represents the actual accounting profit, not a target.">
                          <span>Profit/item (RON)</span>
                        </Tooltip>
                      ),
                      key: 'dummy-profit-item',
                      width: 190,
                      align: 'center',
                      render: () => <span style={{ color: '#999' }}>—</span>,
                    },
                    {
                      title: (
                        <Tooltip title="Real profit per hour. Calculated as: Profit/item * Printed items/hour. This shows the actual profit rate based on current selling price and production speed.">
                          <span>Profit/hour (RON)</span>
                        </Tooltip>
                      ),
                      key: 'dummy-profit-hour',
                      width: 190,
                      align: 'center',
                      render: () => <span style={{ color: '#999' }}>—</span>,
                    },
                    {
                      title: (
                        <Tooltip title="Number of complete items printed per hour. For single-part products: (Plate Stack Size * 60) / Plate Print Time. For multiple parts products: 60 / (Sum of (Plate Print Time / Plate Stack Size) for all parts), since parts are printed sequentially.">
                          <span>Printed items/hour</span>
                        </Tooltip>
                      ),
                      key: 'printed-items-per-hour',
                      width: 190,
                      align: 'center',
                      render: (_, partRecord) => {
                        const partPrintTime = partRecord.printTime !== null && partRecord.printTime !== undefined ? partRecord.printTime : 0;
                        const partStackSize = partRecord.stackSize !== null && partRecord.stackSize !== undefined ? partRecord.stackSize : 1;
                        const printPerHour = partPrintTime > 0 ? (partStackSize * 60) / partPrintTime : 0;
                        return <span style={{ color: theme.COLORS.text.body, fontSize: '15px' }}>{formatNumber(printPerHour, 2)}</span>;
                      },
                    },
                    {
                      title: (
                        <Tooltip title="Total electricity cost per item. Calculated as: (Plate Print Time / 60) * Printer Consumption (kW) * Electricity Cost (lei/kWh) / Plate Stack Size. For multiple parts products, this is the sum of electricity costs per piece for all parts.">
                          <span>Electricity Cost (RON)</span>
                        </Tooltip>
                      ),
                      key: 'electricity-cost',
                      width: 160,
                      align: 'center',
                      render: (_, partRecord) => {
                        const printerConsumption = electricitySettings.printerConsumption || 0.12; // kW
                        const electricityCost = electricitySettings.electricityCost || 1.11; // lei/kWh
                        const partPrintTime = partRecord.printTime !== null && partRecord.printTime !== undefined ? partRecord.printTime : 0;
                        const partStackSize = partRecord.stackSize !== null && partRecord.stackSize !== undefined ? partRecord.stackSize : 1;
                        const partElectricity = partPrintTime > 0 ? (partPrintTime / 60) * printerConsumption * electricityCost : 0;
                        return <span style={{ color: theme.COLORS.text.body, fontSize: '15px' }}>{formatNumber(partElectricity, 2)}</span>;
                      },
                    },
                    {
                      title: (
                        <Tooltip title="Target profit rate in RON per hour. This is a global setting that can be overridden per product. Used to calculate the 'Best Price'. If not set for a product, the global setting from Settings is used.">
                          <span>Target Print Rate (RON/H)</span>
                        </Tooltip>
                      ),
                      key: 'target-print-rate',
                      width: 190,
                      align: 'center',
                      render: () => {
                        const targetPerHour = record.targetPerHour !== null && record.targetPerHour !== undefined 
                          ? record.targetPerHour 
                          : (electricitySettings.targetPrintRate || 22.00);
                        return <span style={{ fontSize: '15px', fontWeight: 600 }}>{formatNumber(targetPerHour, 2)}</span>;
                      },
                    },
                    {
                      title: (
                        <Tooltip title="Total print time in minutes for one plate. For multiple parts products, this is not applicable at the product level - each part has its own print time.">
                          <span>Plate Print Time</span>
                        </Tooltip>
                      ),
                      dataIndex: 'printTime',
                      key: 'printTime',
                      width: 150,
                      align: 'center',
                      render: (value, partRecord) => (
                        <EditablePartCell
                          editing={isEditingParts}
                          dataIndex="printTime"
                          partRecord={partRecord}
                          productKey={record.key}
                          inputType="number"
                          min={0}
                        />
                      ),
                    },
                    {
                      title: (
                        <Tooltip title="Number of items that can be printed on one plate. Used to calculate cost per piece and items per hour. For multiple parts products, this is not applicable at the product level - each part has its own stack size.">
                          <span>Plate Stack Size</span>
                        </Tooltip>
                      ),
                      dataIndex: 'stackSize',
                      key: 'stackSize',
                      width: 150,
                      align: 'center',
                      render: (value, partRecord) => (
                        <EditablePartCell
                          editing={isEditingParts}
                          dataIndex="stackSize"
                          partRecord={partRecord}
                          productKey={record.key}
                          inputType="number"
                          min={1}
                        />
                      ),
                    },
                    {
                      title: (
                        <Tooltip title="Total material cost for one plate. The cost per piece is calculated as: Material Cost / Plate Stack Size. For multiple parts products, this is the sum of (Material Cost / Plate Stack Size) for all parts.">
                          <span>Material Cost</span>
                        </Tooltip>
                      ),
                      dataIndex: 'costMaterial',
                      key: 'costMaterial',
                      width: 190,
                      align: 'center',
                      render: (value, partRecord) => (
                        <EditablePartCell
                          editing={isEditingParts}
                          dataIndex="costMaterial"
                          partRecord={partRecord}
                          productKey={record.key}
                          inputType="decimal"
                          min={0}
                          step={0.01}
                          precision={2}
                        />
                      ),
                    },
                    {
                      title: (
                        <Tooltip title="Packaging cost per product (carton, plastic bags, etc.). This is a fixed cost per final product, not per print. Not editable at part level - set at the main product level.">
                          <span>Packaging Costs (RON)</span>
                        </Tooltip>
                      ),
                      key: 'packaging-cost',
                      width: 200,
                      align: 'center',
                      render: () => <span style={{ color: '#999' }}>—</span>,
                    },
                    {
                      title: (
                        <Tooltip title="Available actions for the part: Remove (to delete the part from the product). Only available when editing parts.">
                          <span>Actions</span>
                        </Tooltip>
                      ),
                      key: 'actions',
                      width: 180,
                      render: (_, partRecord) => {
                        if (isEditingParts) {
                          return (
                            <Button
                              type="link"
                              danger
                              size="small"
                              icon={<DeleteOutlined />}
                              onClick={() => removePart(record.key, partRecord.key)}
                            >
                              Remove
                            </Button>
                          );
                        }
                        return null;
                      },
                    },
                  ];


                  return (
                    <div style={{ 
                      padding: '16px 16px 16px 0',
                      background: theme.COLORS.primaryLight, 
                      borderRadius: theme.RADIUS.md 
                    }}>
                      <div style={{ marginBottom: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Text strong style={{ fontSize: '16px' }}>Parts ({record.parts.length})</Text>
                        {isEditingParts && (
                          <Space>
                            <Button
                              type="primary"
                              size="small"
                              icon={<PlusCircleOutlined />}
                              onClick={() => addPart(record.key)}
                            >
                              Add Part
                            </Button>
                          </Space>
                        )}
                      </div>
                      <Table
                        columns={partColumns}
                        dataSource={record.parts}
                        rowKey="key"
                        pagination={false}
                        size="small"
                      />
                    </div>
                  );
                },
                rowExpandable: (record) => record.isMultipleParts && record.parts && record.parts.length > 0,
              }}
            />
          </Spin>
          {products.length === 0 && !loading && (
            <div style={{ 
              textAlign: 'center', 
              padding: '60px 0',
              color: theme.COLORS.text.muted,
              fontSize: '16px'
            }}>
              No products yet. Click "Add Product" to get started.
            </div>
          )}
        </Card>

        <Modal
          title="Add New Product"
          open={addProductModalVisible}
          onCancel={() => {
            setAddProductModalVisible(false);
            addProductForm.resetFields();
          }}
          onOk={async () => {
            try {
              const values = await addProductForm.validateFields();
              handleAddProduct(values);
            } catch (error) {
              console.error('Validation failed:', error);
            }
          }}
          okText="Add Product"
          cancelText="Cancel"
          width={600}
        >
          <Form
            form={addProductForm}
            layout="vertical"
            initialValues={{ isMultipleParts: false }}
          >
            <Form.Item
              name="isMultipleParts"
              label="Multiple Parts Product?"
              valuePropName="checked"
            >
              <Switch />
            </Form.Item>
            <Form.Item
              name="productName"
              label="Product Name"
              rules={[{ required: true, message: 'Please enter product name' }]}
            >
              <Input placeholder="Enter product name" />
            </Form.Item>
            <Form.Item
              name="sku"
              label="SKU"
            >
              <Input placeholder="Enter SKU (optional)" />
            </Form.Item>
            <Form.Item
              name="targetPerHour"
              label="Target Print Rate Override (RON/H)"
              tooltip="Leave empty to use global setting from Settings. Set a value to override for this product only."
            >
              <InputNumber
                min={0}
                step={0.01}
                precision={2}
                placeholder="Use global setting"
                style={{ width: '100%' }}
              />
            </Form.Item>
            <Form.Item
              noStyle
              shouldUpdate={(prevValues, currentValues) => prevValues.isMultipleParts !== currentValues.isMultipleParts}
            >
              {({ getFieldValue }) => {
                const isMultipleParts = getFieldValue('isMultipleParts');
                if (isMultipleParts) {
                  return (
                    <div style={{ 
                      marginTop: 16, 
                      padding: 12, 
                      background: theme.COLORS.primaryLight, 
                      borderRadius: theme.RADIUS.md 
                    }}>
                      <Text type="secondary" style={{ fontSize: '13px' }}>
                        This product will have multiple parts. You can add parts after creating the product by expanding the row.
                      </Text>
                    </div>
                  );
                }
                return null;
              }}
            </Form.Item>
          </Form>
        </Modal>

        <Modal
          title="Electricity Settings"
          open={electricityModalVisible}
          onCancel={() => setElectricityModalVisible(false)}
          onOk={async () => {
            try {
              const values = await electricityForm.validateFields();
              // Settings will be saved automatically via the useEffect that watches electricitySettings
              setElectricitySettings(values);
              setElectricityModalVisible(false);
              message.success('Electricity settings saved!');
            } catch (error) {
              console.error('Validation failed:', error);
            }
          }}
          okText="Save"
          cancelText="Cancel"
          width={600}
        >
          <Form
            form={electricityForm}
            layout="vertical"
            initialValues={electricitySettings}
          >
            <Form.Item
              name="printerConsumption"
              label="Consum Imprimantă (kW)"
              rules={[
                { required: true, message: 'Please enter printer consumption' },
                { type: 'number', min: 0, message: 'Consumption must be positive' }
              ]}
            >
              <InputNumber
                min={0}
                step={0.01}
                precision={2}
                placeholder="0.12"
                style={{ width: '100%', fontSize: '16px' }}
              />
            </Form.Item>

            <Form.Item
              name="electricityCost"
              label="Cost Consum (lei/kWh)"
              rules={[
                { required: true, message: 'Please enter electricity cost' },
                { type: 'number', min: 0, message: 'Cost must be positive' }
              ]}
            >
              <InputNumber
                min={0}
                step={0.01}
                precision={2}
                placeholder="1.11"
                style={{ width: '100%', fontSize: '16px' }}
              />
            </Form.Item>

            <Form.Item
              name="targetPrintRate"
              label="Target Print Rate (RON/H)"
              rules={[
                { required: true, message: 'Please enter target print rate' },
                { type: 'number', min: 0, message: 'Target must be positive' }
              ]}
            >
              <InputNumber
                min={0}
                step={0.01}
                precision={2}
                placeholder="22.00"
                style={{ width: '100%', fontSize: '16px' }}
              />
            </Form.Item>

            <div style={{ 
              marginTop: 16, 
              padding: 12, 
              background: theme.COLORS.primaryLight, 
              borderRadius: theme.RADIUS.md 
            }}>
              <Text type="secondary" style={{ fontSize: '13px' }}>
                <strong>Formula:</strong> Electricity Cost = (Print Time / 60) × Printer Consumption (kW) × Electricity Cost (lei/kWh)
              </Text>
            </div>
          </Form>
        </Modal>
      </div>
    </MainLayout>
  );
}
