import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Card, Table, Button, Space, InputNumber, Input, Typography, Popconfirm, message, Modal, Form, Select, Spin, Switch, Collapse } from 'antd';
import { PlusOutlined, DeleteOutlined, SaveOutlined, SettingOutlined, CloudDownloadOutlined, PlusCircleOutlined, MinusCircleOutlined } from '@ant-design/icons';
import MainLayout from '../components/MainLayout';
import * as theme from '../theme/constants';
import { credentialsAPI, emagAPI, platformsAPI, calculatorAPI } from '../api';

const { Title, Text } = Typography;

export default function ProductivityCalculatorPage() {
  const [products, setProducts] = useState([]);
  const [editingKey, setEditingKey] = useState('');
  const [electricityModalVisible, setElectricityModalVisible] = useState(false);
  const [electricityForm] = Form.useForm();
  const [electricitySettings, setElectricitySettings] = useState({
    printerConsumption: 0.12,
    electricityCost: 1.11
  });
  const [emagRomaniaCredential, setEmagRomaniaCredential] = useState(null);
  const [loading, setLoading] = useState(true);
  const [addProductModalVisible, setAddProductModalVisible] = useState(false);
  const [addProductForm] = Form.useForm();
  const [expandedRows, setExpandedRows] = useState([]);
  const [editingParts, setEditingParts] = useState({}); // { productKey: true/false }

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
          await calculatorAPI.saveProducts(products, electricitySettings);
        } catch (error) {
          console.error('Failed to save products to server:', error);
          message.error('Failed to save products. Please try again.');
        }
      }, 1000); // Debounce: save 1 second after last change
      
      return () => clearTimeout(timeoutId);
    }
  }, [products, electricitySettings, loading]);

  const calculateRow = useCallback((record) => {
    const {
      isMultipleParts = false,
      parts = [],
      printTime = 0,        // H - print time în minute
      stackSize = 1,         // I - stack size
      costMaterial = 0,      // J - cost material (TOTAL per print)
      targetPerHour = 22,    // 🎯 Target lei/oră (valoare fixă, editabilă)
      commissionEmag = 10,   // K - comision emag (%)
      pretEmag = 0,          // Prețul real din eMAG (hardcoded, editabil)
    } = record;

    const printerConsumption = electricitySettings.printerConsumption || 0.12; // kW
    const electricityCost = electricitySettings.electricityCost || 1.11; // lei/kWh

    // Dacă este produs cu multiple părți, fiecare parte este calculată independent
    if (isMultipleParts && parts && parts.length > 0) {
      let totalBestPrice = 0;
      let totalCostMaterial = 0;
      let totalElectricity = 0;
      let totalPrintTime = 0;
      let minPrintPerHour = Infinity;
      let hasValidParts = false;
      
      const commissionDecimal = commissionEmag / 100;
      
      // Pentru fiecare parte, calculăm independent: printPerHour, bestPrice, costuri
      parts.forEach(part => {
        const partPrintTime = part.printTime !== null && part.printTime !== undefined ? part.printTime : 0;
        const partStackSize = part.stackSize !== null && part.stackSize !== undefined ? part.stackSize : 1;
        const partCostMaterial = part.costMaterial !== null && part.costMaterial !== undefined ? part.costMaterial : 0;
        
        // Verificăm dacă partea are date valide
        if (partPrintTime > 0 || partCostMaterial > 0) {
          hasValidParts = true;
        }
        
        // Print per hour pentru această parte (job independent)
        const partPrintPerHour = partPrintTime > 0 ? (partStackSize * 60) / partPrintTime : 0;
        
        // Costuri per piesă pentru această parte
        const partCostMaterialPerPiece = partStackSize > 0 ? partCostMaterial / partStackSize : 0;
        
        // Electricity pentru această parte
        const partElectricity = partPrintTime > 0 ? (partPrintTime / 60) * printerConsumption * electricityCost : 0;
        const partElectricityPerPiece = partStackSize > 0 ? partElectricity / partStackSize : 0;
        
        // Best price pentru această parte (calculat independent)
        const partTargetPerPiece = partPrintPerHour > 0 ? targetPerHour / partPrintPerHour : 0;
        const partBestPrice = (partTargetPerPiece + partCostMaterialPerPiece + partElectricityPerPiece) > 0
          ? (partTargetPerPiece + partCostMaterialPerPiece + partElectricityPerPiece) / (1 - commissionDecimal)
          : 0;
        
        // Adunăm bestPrice-urile pentru a obține prețul total
        totalBestPrice += partBestPrice;
        totalCostMaterial += partCostMaterial;
        totalElectricity += partElectricity;
        totalPrintTime = Math.max(totalPrintTime, partPrintTime);
        
        // Print per hour global = cel mai mic (cel mai lent job determină viteza)
        if (partPrintPerHour > 0) {
          minPrintPerHour = Math.min(minPrintPerHour, partPrintPerHour);
        }
      });

      if (!hasValidParts) {
        return {
          electricity: '0.00',
          printPerHour: '0.00',
          bestPrice: '0.00',
          targetPerHour: targetPerHour.toFixed(2),
          profitPerPiece: '0.00',
          profitPerHour: '0.00',
        };
      }

      // Print per hour global = cel mai mic printPerHour (cel mai lent job)
      const printPerHour = minPrintPerHour === Infinity ? 0 : minPrintPerHour;
      
      // Costuri totale per piesă (suma tuturor părților)
      // Pentru profit, folosim costurile totale
      const totalCostMaterialPerPiece = totalCostMaterial; // Cost total material pentru toate părțile
      const totalElectricityPerPiece = totalElectricity; // Cost total electricitate pentru toate părțile

      // Profit REAL per piesă = pretEmag - (pretEmag * commissionEmag) - totalCostMaterialPerPiece - totalElectricityPerPiece
      // Profit contabil real: cât îți rămâne în mână după comision + costuri (FĂRĂ target)
      const effectivePretEmag = pretEmag !== null && pretEmag !== undefined ? pretEmag : 0;
      const commissionDecimalValue = commissionEmag / 100;
      const profitPerPiece = effectivePretEmag > 0
        ? effectivePretEmag - (effectivePretEmag * commissionDecimalValue) - totalCostMaterialPerPiece - totalElectricityPerPiece
        : 0;

      // Profit per hour = profitPerPiece * printPerHour (cel mai lent job)
      const profitPerHour = profitPerPiece * printPerHour;

      return {
        electricity: totalElectricity.toFixed(2),
        printPerHour: printPerHour.toFixed(2),
        bestPrice: totalBestPrice.toFixed(2), // Suma bestPrice-urilor pentru toate părțile
        targetPerHour: targetPerHour.toFixed(2),
        profitPerPiece: profitPerPiece.toFixed(2),
        profitPerHour: profitPerHour.toFixed(2),
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
    
    const commissionDecimal = commissionEmag / 100;
    
    // 4. Best price = (targetRONperHour / printPerHour + costMaterialPerPiece + electricityPerPiece) / (1 - commissionEmag)
    // Cel mai bun preț de vânzare pentru a atinge target-ul de profit pe oră
    const targetPerPieceForPricing = printPerHour > 0 ? targetPerHour / printPerHour : 0;
    const bestPrice = (targetPerPieceForPricing + costMaterialPerPiece + electricityPerPiece) > 0
      ? (targetPerPieceForPricing + costMaterialPerPiece + electricityPerPiece) / (1 - commissionDecimal)
      : 0;

    // 5. Profit REAL per piesă = pretEmag - (pretEmag * commissionEmag) - costMaterialPerPiece - electricityPerPiece
    // Profit contabil real: cât îți rămâne în mână după comision + costuri (FĂRĂ target)
    const effectivePretEmag = pretEmag !== null && pretEmag !== undefined ? pretEmag : 0;
    const commissionDecimalValue = commissionEmag / 100;
    const profitPerPiece = effectivePretEmag > 0
      ? effectivePretEmag - (effectivePretEmag * commissionDecimalValue) - costMaterialPerPiece - electricityPerPiece
      : 0;

    // 6. Profit per hour = profitPerPiece * printPerHour
    const profitPerHour = profitPerPiece * printPerHour;

      return {
        electricity: electricity.toFixed(2),
        printPerHour: printPerHour.toFixed(2),
        bestPrice: bestPrice.toFixed(2),
        targetPerHour: targetPerHour.toFixed(2),
        profitPerPiece: profitPerPiece.toFixed(2),
        profitPerHour: profitPerHour.toFixed(2),
      };
  }, [electricitySettings]);

  const addNewRow = useCallback(() => {
    setAddProductModalVisible(true);
    addProductForm.resetFields();
    addProductForm.setFieldsValue({ isMultipleParts: false });
  }, [addProductForm]);

  const handleAddProduct = useCallback((values) => {
    const { isMultipleParts, productName, sku } = values;
    const newProduct = {
      key: Date.now().toString(),
      productName: productName || '',
      sku: sku || '',
      isMultipleParts: isMultipleParts || false,
      targetPerHour: 22, // 🎯 Target lei/oră (valoare fixă, editabilă)
      commissionEmag: 10,
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
    }

    setProducts(prev => [...prev, newProduct]);
    setAddProductModalVisible(false);
    setEditingKey(newProduct.key);
    message.success('Product added successfully');
  }, []);

  const handleCellChange = useCallback((recordKey, dataIndex, value) => {
    setProducts(prev => prev.map(item => {
      if (item.key === recordKey) {
        return { ...item, [dataIndex]: value };
      }
      return item;
    }));
  }, []);

  const handlePartChange = useCallback((productKey, partKey, field, value) => {
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
  }, []);

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
    setEditingKey(record.key);
  }, []);

  const cancel = useCallback(() => {
    setEditingKey('');
  }, []);

  const save = useCallback((key) => {
    setEditingKey('');
    setEditingParts(prev => {
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
        handleBlur();
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
      prevProps.record?.[prevProps.dataIndex] === nextProps.record?.[nextProps.dataIndex]
    );
  });

  const columns = useMemo(() => [
    {
      title: 'Object',
      dataIndex: 'productName',
      key: 'productName',
      width: 250,
      editable: true,
      render: (text, record) => {
        if (record.isMultipleParts) {
          return <strong style={{ color: theme.COLORS.primary }}>{text || <span style={{ color: '#999' }}>—</span>}</strong>;
        }
        return text || <span style={{ color: '#999' }}>—</span>;
      },
    },
    {
      title: 'SKU',
      dataIndex: 'sku',
      key: 'sku',
      width: 150,
      editable: true,
      render: (text) => text || <span style={{ color: '#999' }}>—</span>,
    },
    {
      title: 'Multiple Parts',
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
      title: 'Best Price',
      key: 'bestPrice',
      width: 180,
      align: 'center',
      render: (_, record) => {
        const calc = calculateRow(record);
        return <strong style={{ color: theme.COLORS.text.muted || '#64748b', fontSize: '16px' }}>{calc.bestPrice}</strong>;
      },
    },
    {
      title: 'EMAG RO Price',
      dataIndex: 'pretEmag',
      key: 'pretEmag',
      width: 200,
      editable: false, // Nu este editabil - se preia doar de pe eMAG
      inputType: 'decimal',
      align: 'center',
      render: (value) => (
        <span style={{ fontSize: '15px' }}>{parseFloat(value || 0).toFixed(2)}</span>
      ),
    },
    {
      title: 'Profit/item',
      key: 'profitPerPiece',
      width: 180,
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
      title: 'Profit/hour',
      key: 'profitPerHour',
      width: 180,
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
      title: 'Printed items/hour',
      key: 'printPerHour',
      width: 180,
      align: 'center',
      render: (_, record) => {
        const calc = calculateRow(record);
        return <span style={{ color: theme.COLORS.text.body, fontSize: '15px' }}>{calc.printPerHour}</span>;
      },
    },
    {
      title: 'Target Print Rate (RON/H)',
      dataIndex: 'targetPerHour',
      key: 'targetPerHour',
      width: 180,
      editable: true,
      inputType: 'decimal',
      align: 'center',
      render: (value) => <span style={{ fontSize: '15px', fontWeight: 600 }}>{parseFloat(value || 22).toFixed(2)}</span>,
    },
    {
      title: 'Electricity Cost',
      key: 'electricity',
      width: 150,
      align: 'center',
      render: (_, record) => {
        const calc = calculateRow(record);
        return <span style={{ color: theme.COLORS.text.body, fontSize: '15px' }}>{calc.electricity}</span>;
      },
    },
    {
      title: 'Plate Stack Size',
      dataIndex: 'stackSize',
      key: 'stackSize',
      width: 150,
      editable: (record) => !record.isMultipleParts,
      inputType: 'number',
      align: 'right',
      render: (value, record) => {
        if (record.isMultipleParts) {
          return <span style={{ fontSize: '15px', color: '#999' }}>—</span>;
        }
        return <span style={{ fontSize: '15px' }}>{value || 1}</span>;
      },
    },
    {
      title: 'Material Cost',
      dataIndex: 'costMaterial',
      key: 'costMaterial',
      width: 180,
      editable: (record) => !record.isMultipleParts,
      inputType: 'decimal',
      align: 'center',
      render: (value, record) => {
        if (record.isMultipleParts) {
          return <span style={{ fontSize: '15px', color: '#999' }}>—</span>;
        }
        return <span style={{ fontSize: '15px' }}>{parseFloat(value || 0).toFixed(2)}</span>;
      },
    },
    {
      title: 'EMAG Commission',
      dataIndex: 'commissionEmag',
      key: 'commissionEmag',
      width: 180,
      editable: true,
      inputType: 'decimal',
      align: 'center',
      render: (value) => <span style={{ fontSize: '15px' }}>{parseFloat(value || 10).toFixed(1)}</span>,
    },
    {
      title: 'Actions',
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
            padding: 12px 18px !important;
            font-size: 15px !important;
          }
          .productivity-table .ant-table-thead > tr > th {
            padding: 15px 18px !important;
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
            padding: 6px 11px !important;
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
                Productivity Calculator
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
                  
                  const isEditingParts = editingParts[record.key];
                  
                  const partColumns = [
                    {
                      title: 'Part Name',
                      dataIndex: 'partName',
                      key: 'partName',
                      width: 200,
                      render: (text, partRecord) => {
                        if (isEditingParts) {
                          return (
                            <Input
                              value={text || ''}
                              onChange={(e) => handlePartChange(record.key, partRecord.key, 'partName', e.target.value)}
                              placeholder="Part name"
                              style={{ width: '100%' }}
                            />
                          );
                        }
                        return <span>{text || <span style={{ color: '#999' }}>—</span>}</span>;
                      },
                    },
                    {
                      title: 'Plate Print Time',
                      dataIndex: 'printTime',
                      key: 'printTime',
                      width: 150,
                      align: 'right',
                      render: (value, partRecord) => {
                        if (isEditingParts) {
                          return (
                            <InputNumber
                              value={value !== null && value !== undefined ? value : undefined}
                              onChange={(val) => handlePartChange(record.key, partRecord.key, 'printTime', val)}
                              min={0}
                              placeholder="—"
                              style={{ width: '100%' }}
                            />
                          );
                        }
                        return <span>{value !== null && value !== undefined ? value : <span style={{ color: '#999' }}>—</span>}</span>;
                      },
                    },
                    {
                      title: 'Plate Stack Size',
                      dataIndex: 'stackSize',
                      key: 'stackSize',
                      width: 150,
                      align: 'right',
                      render: (value, partRecord) => {
                        if (isEditingParts) {
                          return (
                            <InputNumber
                              value={value !== null && value !== undefined ? value : undefined}
                              onChange={(val) => handlePartChange(record.key, partRecord.key, 'stackSize', val)}
                              min={1}
                              placeholder="—"
                              style={{ width: '100%' }}
                            />
                          );
                        }
                        return <span>{value !== null && value !== undefined ? value : <span style={{ color: '#999' }}>—</span>}</span>;
                      },
                    },
                    {
                      title: 'Material Cost',
                      dataIndex: 'costMaterial',
                      key: 'costMaterial',
                      width: 150,
                      align: 'right',
                      render: (value, partRecord) => {
                        if (isEditingParts) {
                          return (
                            <InputNumber
                              value={value !== null && value !== undefined ? value : undefined}
                              onChange={(val) => handlePartChange(record.key, partRecord.key, 'costMaterial', val)}
                              min={0}
                              step={0.01}
                              precision={2}
                              placeholder="—"
                              style={{ width: '100%' }}
                            />
                          );
                        }
                        return <span>{value !== null && value !== undefined ? parseFloat(value).toFixed(2) : <span style={{ color: '#999' }}>—</span>}</span>;
                      },
                    },
                    {
                      title: 'Actions',
                      key: 'actions',
                      width: 150,
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
                    <div style={{ padding: '16px', background: theme.COLORS.primaryLight, borderRadius: theme.RADIUS.md }}>
                      <div style={{ marginBottom: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Text strong style={{ fontSize: '16px' }}>Parts ({record.parts.length})</Text>
                        <Space>
                          {isEditingParts ? (
                            <>
                              <Button
                                type="primary"
                                size="small"
                                icon={<SaveOutlined />}
                                onClick={() => saveParts(record.key)}
                              >
                                Save
                              </Button>
                              <Button
                                size="small"
                                onClick={() => cancelParts(record.key)}
                              >
                                Cancel
                              </Button>
                            </>
                          ) : (
                            <>
                              <Button
                                type="primary"
                                size="small"
                                icon={<PlusCircleOutlined />}
                                onClick={() => addPart(record.key)}
                              >
                                Add Part
                              </Button>
                              <Button
                                size="small"
                                onClick={() => editParts(record.key)}
                              >
                                Edit
                              </Button>
                            </>
                          )}
                        </Space>
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
