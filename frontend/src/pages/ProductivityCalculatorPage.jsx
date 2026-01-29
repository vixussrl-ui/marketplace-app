import React, { useState } from 'react';
import { Card, Form, InputNumber, Input, Button, Space, Typography, Divider, Alert } from 'antd';
import { CalculatorOutlined } from '@ant-design/icons';
import MainLayout from '../components/MainLayout';
import * as theme from '../theme/constants';

const { Title, Text } = Typography;

export default function ProductivityCalculatorPage() {
  const [form] = Form.useForm();
  const [result, setResult] = useState(null);

  const calculateBestPrice = (values) => {
    const {
      printTime,      // în minute
      stackSize,      // număr de piese în stack
      costMaterial,  // cost material per unitate (lei)
      costElectricity, // cost electricitate per unitate (lei)
      commissionShop, // comision magazin (%)
    } = values;

    // Cost total per unitate
    const costPerUnit = costMaterial + costElectricity;
    
    // Cost total pentru stack
    const totalStackCost = costPerUnit * stackSize;
    
    // Calculăm prețul minim necesar pentru a acoperi costurile și comisionul
    // Preț = Cost / (1 - Comision/100)
    // Astfel, după ce se scade comisionul, rămâne exact costul
    const commissionDecimal = commissionShop / 100;
    const minPricePerUnit = costPerUnit / (1 - commissionDecimal);
    const minPriceStack = minPricePerUnit * stackSize;
    
    // Profit per unitate (după comision)
    const profitPerUnit = minPricePerUnit - costPerUnit;
    const profitStack = profitPerUnit * stackSize;
    
    // Profit margin (%)
    const profitMargin = (profitPerUnit / costPerUnit) * 100;

    setResult({
      costPerUnit: costPerUnit.toFixed(2),
      totalStackCost: totalStackCost.toFixed(2),
      minPricePerUnit: minPricePerUnit.toFixed(2),
      minPriceStack: minPriceStack.toFixed(2),
      profitPerUnit: profitPerUnit.toFixed(2),
      profitStack: profitStack.toFixed(2),
      profitMargin: profitMargin.toFixed(2),
      printTime,
      stackSize,
    });
  };

  const onFinish = (values) => {
    calculateBestPrice(values);
  };

  const onReset = () => {
    form.resetFields();
    setResult(null);
  };

  return (
    <MainLayout currentKey="calculator">
      <div style={{ maxWidth: 900, margin: '0 auto', padding: theme.SPACING.md }}>
        <Card
          title={
            <Space>
              <CalculatorOutlined />
              <span style={theme.TYPOGRAPHY.heading}>Productivity Calculator</span>
            </Space>
          }
          style={theme.CARD_STYLES.base}
          headStyle={theme.CARD_STYLES.head}
          bodyStyle={theme.CARD_STYLES.body}
        >
          <Form
            form={form}
            layout="vertical"
            onFinish={onFinish}
            initialValues={{
              printTime: 60,
              stackSize: 1,
              costMaterial: 0,
              costElectricity: 0,
              commissionShop: 15,
            }}
          >
            <Form.Item
              label="Product Name"
              name="productName"
              rules={[{ required: false, message: 'Optional product name' }]}
            >
              <Input placeholder="Enter product name (optional)" />
            </Form.Item>

            <Form.Item
              label="Print Time (minutes)"
              name="printTime"
              rules={[{ required: true, message: 'Please enter print time' }]}
              tooltip="Time required to print one unit"
            >
              <InputNumber
                min={0}
                step={1}
                style={{ width: '100%' }}
                placeholder="e.g., 60"
              />
            </Form.Item>

            <Form.Item
              label="Stack Size"
              name="stackSize"
              rules={[{ required: true, message: 'Please enter stack size' }]}
              tooltip="Number of units printed in one batch"
            >
              <InputNumber
                min={1}
                step={1}
                style={{ width: '100%' }}
                placeholder="e.g., 1"
              />
            </Form.Item>

            <Form.Item
              label="Material Cost (lei per unit)"
              name="costMaterial"
              rules={[{ required: true, message: 'Please enter material cost' }]}
            >
              <InputNumber
                min={0}
                step={0.01}
                precision={2}
                style={{ width: '100%' }}
                placeholder="e.g., 5.50"
              />
            </Form.Item>

            <Form.Item
              label="Electricity Cost (lei per unit)"
              name="costElectricity"
              rules={[{ required: true, message: 'Please enter electricity cost' }]}
            >
              <InputNumber
                min={0}
                step={0.01}
                precision={2}
                style={{ width: '100%' }}
                placeholder="e.g., 0.50"
              />
            </Form.Item>

            <Form.Item
              label="Shop Commission (%)"
              name="commissionShop"
              rules={[{ required: true, message: 'Please enter shop commission' }]}
              tooltip="Marketplace commission percentage (e.g., 15 for 15%)"
            >
              <InputNumber
                min={0}
                max={100}
                step={0.1}
                precision={1}
                style={{ width: '100%' }}
                placeholder="e.g., 15"
              />
            </Form.Item>

            <Form.Item>
              <Space>
                <Button
                  type="primary"
                  htmlType="submit"
                  icon={<CalculatorOutlined />}
                  size="large"
                  style={theme.BUTTON_STYLES.primary}
                >
                  Calculate Best Price
                </Button>
                <Button
                  onClick={onReset}
                  size="large"
                  style={theme.BUTTON_STYLES.secondary}
                >
                  Reset
                </Button>
              </Space>
            </Form.Item>
          </Form>

          {result && (
            <>
              <Divider />
              <Card
                title={<Title level={4} style={{ margin: 0, color: theme.COLORS.primary }}>Calculation Results</Title>}
                style={{
                  background: theme.COLORS.primaryLight,
                  border: `2px solid ${theme.COLORS.primary}`,
                }}
              >
                {result.productName && (
                  <Alert
                    message={`Product: ${result.productName}`}
                    type="info"
                    style={{ marginBottom: theme.SPACING.md }}
                  />
                )}
                
                <div style={{ display: 'grid', gap: theme.SPACING.md }}>
                  <div style={{ 
                    padding: theme.SPACING.md, 
                    background: 'white', 
                    borderRadius: theme.RADIUS.md,
                    border: `1px solid ${theme.COLORS.border}`
                  }}>
                    <Text strong style={{ fontSize: '16px', color: theme.COLORS.text.body }}>
                      Cost Analysis
                    </Text>
                    <div style={{ marginTop: theme.SPACING.sm }}>
                      <Text>Cost per unit: </Text>
                      <Text strong style={{ color: theme.COLORS.text.body }}>
                        {result.costPerUnit} lei
                      </Text>
                    </div>
                    <div>
                      <Text>Total stack cost ({result.stackSize} units): </Text>
                      <Text strong style={{ color: theme.COLORS.text.body }}>
                        {result.totalStackCost} lei
                      </Text>
                    </div>
                    <div>
                      <Text>Print time: </Text>
                      <Text strong style={{ color: theme.COLORS.text.body }}>
                        {result.printTime} minutes
                      </Text>
                    </div>
                  </div>

                  <div style={{ 
                    padding: theme.SPACING.md, 
                    background: theme.COLORS.successLight || '#f0f9ff',
                    borderRadius: theme.RADIUS.md,
                    border: `2px solid ${theme.COLORS.success || '#10b981'}`,
                  }}>
                    <Text strong style={{ fontSize: '18px', color: theme.COLORS.success || '#10b981' }}>
                      🎯 Best Price
                    </Text>
                    <div style={{ marginTop: theme.SPACING.sm }}>
                      <Text style={{ fontSize: '14px' }}>Per unit: </Text>
                      <Text strong style={{ fontSize: '20px', color: theme.COLORS.success || '#10b981' }}>
                        {result.minPricePerUnit} lei
                      </Text>
                    </div>
                    <div>
                      <Text style={{ fontSize: '14px' }}>Per stack ({result.stackSize} units): </Text>
                      <Text strong style={{ fontSize: '20px', color: theme.COLORS.success || '#10b981' }}>
                        {result.minPriceStack} lei
                      </Text>
                    </div>
                  </div>

                  <div style={{ 
                    padding: theme.SPACING.md, 
                    background: 'white', 
                    borderRadius: theme.RADIUS.md,
                    border: `1px solid ${theme.COLORS.border}`
                  }}>
                    <Text strong style={{ fontSize: '16px', color: theme.COLORS.text.body }}>
                      Profit Analysis
                    </Text>
                    <div style={{ marginTop: theme.SPACING.sm }}>
                      <Text>Profit per unit: </Text>
                      <Text strong style={{ color: theme.COLORS.success || '#10b981' }}>
                        {result.profitPerUnit} lei
                      </Text>
                    </div>
                    <div>
                      <Text>Profit per stack: </Text>
                      <Text strong style={{ color: theme.COLORS.success || '#10b981' }}>
                        {result.profitStack} lei
                      </Text>
                    </div>
                    <div>
                      <Text>Profit margin: </Text>
                      <Text strong style={{ color: theme.COLORS.success || '#10b981' }}>
                        {result.profitMargin}%
                      </Text>
                    </div>
                  </div>
                </div>

                <Alert
                  message="Note"
                  description="Best price is calculated to cover all costs and marketplace commission. This is the minimum price to break even. You may want to add additional profit margin on top of this."
                  type="info"
                  style={{ marginTop: theme.SPACING.md }}
                />
              </Card>
            </>
          )}
        </Card>
      </div>
    </MainLayout>
  );
}

