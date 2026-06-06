import React, { createContext, useContext, useState } from 'react';

const OrderContext = createContext();

export const useOrder = () => useContext(OrderContext);

export const OrderProvider = ({ children, initialData = {} }) => {
  const [currentStep, setCurrentStep] = useState(1);
  const [orderData, setOrderData] = useState({
    items: [
      {
        id: crypto.randomUUID(),
        catalog_sku: '',
        quantity: 1,
        selectedProductShortCode: initialData.product?.shortCode || '',
        selectedPartnerId: initialData.partner?.id || '',
        selectedColor: initialData.variant?.color_hex || '',
        selectedSize: initialData.variant?.size || '',
        design_url_front: '',
        design_url_back: '',
        design_url_sleeve: '',
        mockup_url_front: '',
        mockup_url_back: '',
        mockup_url_sleeve: '',
      }
    ],
    shippingAddress: {
      fullName: '',
      email: '',
      phone: '',
      country: 'US',
      state: '',
      city: '',
      street: '',
      zipcode: '',
    },
    shippingService: 'Standard',
  });
  const [calculatedCosts, setCalculatedCosts] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitResult, setSubmitResult] = useState(null);

  const updateOrderData = (data) => {
    setOrderData((prev) => ({ ...prev, ...data }));
  };

  const updateItem = (id, data) => {
    setOrderData((prev) => ({
      ...prev,
      items: prev.items.map(item => item.id === id ? { ...item, ...data } : item),
    }));
  };

  const addItem = (initialData = {}) => {
    setOrderData((prev) => ({
      ...prev,
      items: [
        ...prev.items,
        {
          id: crypto.randomUUID(),
          catalog_sku: '',
          quantity: 1,
          selectedProductShortCode: '',
          selectedPartnerId: '',
          selectedColor: '',
          selectedSize: '',
          ...initialData,
        }
      ]
    }));
  };

  const removeItem = (id) => {
    setOrderData((prev) => ({
      ...prev,
      items: prev.items.filter(item => item.id !== id),
    }));
  };

  const updateShippingAddress = (addressData) => {
    setOrderData((prev) => ({
      ...prev,
      shippingAddress: { ...prev.shippingAddress, ...addressData },
    }));
  };

  const nextStep = () => setCurrentStep((prev) => Math.min(prev + 1, 3));
  const prevStep = () => setCurrentStep((prev) => Math.max(prev - 1, 1));
  const resetOrder = () => {
    setCurrentStep(1);
    setCalculatedCosts(null);
    setSubmitResult(null);
    setOrderData({
      items: [
        {
          id: crypto.randomUUID(),
          catalog_sku: '',
          quantity: 1,
          selectedProductShortCode: '',
          selectedPartnerId: '',
          selectedColor: '',
          selectedSize: '',
        }
      ],
      shippingAddress: {
        fullName: '',
        email: '',
        phone: '',
        country: 'US',
        state: '',
        city: '',
        street: '',
        zipcode: '',
      },
      shippingService: 'Standard',
    });
  };

  return (
    <OrderContext.Provider
      value={{
        currentStep,
        setCurrentStep,
        nextStep,
        prevStep,
        orderData,
        updateOrderData,
        updateItem,
        addItem,
        removeItem,
        updateShippingAddress,
        calculatedCosts,
        setCalculatedCosts,
        isSubmitting,
        setIsSubmitting,
        submitResult,
        setSubmitResult,
        resetOrder,
      }}
    >
      {children}
    </OrderContext.Provider>
  );
};
