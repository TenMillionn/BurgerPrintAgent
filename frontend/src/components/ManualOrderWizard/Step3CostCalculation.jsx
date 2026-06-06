import React, { useEffect, useState } from 'react';
import { useOrder } from './OrderContext';
import { CheckCircle, AlertCircle, Loader2 } from 'lucide-react';

const Step3CostCalculation = ({ onClose }) => {
  const { 
    orderData, 
    updateOrderData, 
    prevStep, 
    calculatedCosts, 
    setCalculatedCosts,
    isSubmitting,
    setIsSubmitting,
    submitResult,
    setSubmitResult
  } = useOrder();

  const [isLoadingCost, setIsLoadingCost] = useState(false);
  const [costError, setCostError] = useState(null);

  useEffect(() => {
    // Fetch calculate cost when component mounts
    const fetchCost = async () => {
      setIsLoadingCost(true);
      setCostError(null);
      try {
        const token = localStorage.getItem('bp_auth');
        const headers = { 'Content-Type': 'application/json' };
        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
        }

        const response = await fetch('/api/orders/calculate-cost', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            items: orderData.items,
            country: orderData.shippingAddress.country,
            state: orderData.shippingAddress.state,
          }),
        });

        if (!response.ok) {
          throw new Error('Failed to calculate cost');
        }

        const data = await response.json();
        setCalculatedCosts(data);
      } catch (err) {
        setCostError(err.message);
      } finally {
        setIsLoadingCost(false);
      }
    };

    if (!calculatedCosts) {
      fetchCost();
    }
  }, [calculatedCosts, orderData, setCalculatedCosts]);

  const handleSubmitOrder = async () => {
    setIsSubmitting(true);
    setSubmitResult(null);
    try {
      const token = localStorage.getItem('bp_auth');
      const headers = { 'Content-Type': 'application/json' };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      // Map orderData to CreateOrderPayload shape
      const payload = {
        reference_order_id: `MO-${Date.now()}`,
        shipping_method: orderData.shippingService === 'Express' ? 'express' : 'standard',
        sandbox: true,
        shipping: {
          name: orderData.shippingAddress.fullName,
          email: orderData.shippingAddress.email,
          phone: orderData.shippingAddress.phone,
          country: orderData.shippingAddress.country,
          state: orderData.shippingAddress.state,
          city: orderData.shippingAddress.city,
          address1: orderData.shippingAddress.street,
          zip: orderData.shippingAddress.zipcode,
        },
        items: orderData.items.map(item => {
          const newItem = {
            catalog_sku: item.catalog_sku,
            quantity: item.quantity,
          };
          if (item.design_url_front) newItem.design_url_front = item.design_url_front;
          if (item.design_url_back) newItem.design_url_back = item.design_url_back;
          if (item.design_url_sleeve) newItem.design_url_sleeve = item.design_url_sleeve;
          if (item.mockup_url_front) newItem.mockup_url_front = item.mockup_url_front;
          if (item.mockup_url_back) newItem.mockup_url_back = item.mockup_url_back;
          if (item.mockup_url_sleeve) newItem.mockup_url_sleeve = item.mockup_url_sleeve;
          return newItem;
        })
      };

      const response = await fetch('/api/orders/create', {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.message || 'Failed to create order');
      }

      setSubmitResult({ success: true, message: data.message, orderId: data.orderId });
    } catch (err) {
      setSubmitResult({ success: false, message: err.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (submitResult?.success) {
    return (
      <div className="text-center py-8 space-y-4">
        <div className="flex justify-center">
          <CheckCircle className="h-16 w-16 text-green-500" />
        </div>
        <h3 className="text-2xl font-bold text-gray-900 dark:text-white">Order Created Successfully!</h3>
        <p className="text-gray-600 dark:text-gray-300">
          Your order ID is: <span className="font-mono font-semibold">{submitResult.orderId}</span>
        </p>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          We have submitted your order to BurgerPrints Sandbox.
        </p>
        <div className="pt-6">
          <button
            onClick={onClose}
            className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-6 rounded-lg transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">
          Review & Finalize
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Review your cost details and confirm the order.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Left Col: Order Summary */}
        <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
          <h4 className="font-semibold text-gray-800 dark:text-gray-200 mb-4 border-b border-gray-200 dark:border-gray-700 pb-2">
            Order Summary
          </h4>
          
          <div className="space-y-3 text-sm max-h-60 overflow-y-auto">
            {orderData.items.map((item, index) => (
              <div key={item.id} className="pb-2 border-b border-gray-200 dark:border-gray-700 last:border-0">
                <div className="font-medium text-gray-900 dark:text-white">Item {index + 1}</div>
                <div className="text-gray-500 dark:text-gray-400 mt-1">
                  Product: {item.selectedProductShortCode || item.catalog_sku} <br />
                  Variant: {item.selectedSize} <span className="inline-block w-3 h-3 rounded-full ml-1" style={{ backgroundColor: item.selectedColor }}></span> <br />
                  Qty: {item.quantity}
                </div>
              </div>
            ))}
            
            
            <div className="pt-3 mt-3 border-t border-gray-200 dark:border-gray-700">
              <span className="block text-gray-500 dark:text-gray-400 mb-1">Ship To:</span>
              <p className="font-medium text-gray-900 dark:text-white">
                {orderData.shippingAddress.fullName}<br />
                {orderData.shippingAddress.street}<br />
                {orderData.shippingAddress.city}, {orderData.shippingAddress.state} {orderData.shippingAddress.zipcode}<br />
                {orderData.shippingAddress.country}
              </p>
            </div>
          </div>
        </div>

        {/* Right Col: Cost Calculation */}
        <div className="space-y-4">
          <h4 className="font-semibold text-gray-800 dark:text-gray-200">
            Calculated Cost
          </h4>

          {isLoadingCost && (
            <div className="flex items-center space-x-2 text-blue-600">
              <Loader2 className="animate-spin h-5 w-5" />
              <span>Calculating costs...</span>
            </div>
          )}

          {costError && (
            <div className="p-3 bg-red-50 text-red-700 rounded-lg flex items-start space-x-2">
              <AlertCircle className="h-5 w-5 flex-shrink-0" />
              <span className="text-sm">{costError}</span>
            </div>
          )}

          {calculatedCosts && !isLoadingCost && (
            <div className="space-y-4">
              <div className="flex justify-between items-center py-2 border-b border-gray-200 dark:border-gray-700">
                <span className="text-gray-600 dark:text-gray-300">Base Production Fee</span>
                <span className="font-semibold text-gray-900 dark:text-white">${calculatedCosts.productionFee.toFixed(2)}</span>
              </div>

              <div className="space-y-2">
                <span className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Select Shipping Method
                </span>
                {calculatedCosts.shippingOptions.map((opt) => (
                  <label 
                    key={opt.service}
                    className={`block p-3 border rounded-lg cursor-pointer transition-colors ${
                      orderData.shippingService === opt.service 
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' 
                        : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center">
                        <input
                          type="radio"
                          name="shippingService"
                          value={opt.service}
                          checked={orderData.shippingService === opt.service}
                          onChange={(e) => updateOrderData({ shippingService: e.target.value })}
                          className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300"
                        />
                        <div className="ml-3">
                          <span className="block text-sm font-medium text-gray-900 dark:text-white">
                            {opt.service}
                          </span>
                          <span className="block text-xs text-gray-500 dark:text-gray-400">
                            Est: {opt.estimatedDays}
                          </span>
                        </div>
                      </div>
                      <span className="font-medium text-gray-900 dark:text-white">
                        ${opt.cost.toFixed(2)}
                      </span>
                    </div>
                  </label>
                ))}
              </div>

              <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
                <div className="flex justify-between items-center">
                  <span className="font-bold text-lg text-gray-900 dark:text-white">Total Estimated Cost</span>
                  <span className="font-bold text-xl text-blue-600">
                    ${(calculatedCosts.productionFee + (calculatedCosts.shippingOptions.find(o => o.service === orderData.shippingService)?.cost || 0)).toFixed(2)}
                  </span>
                </div>
              </div>
            </div>
          )}

          {submitResult?.success === false && (
            <div className="p-3 bg-red-50 text-red-700 rounded-lg flex items-start space-x-2 mt-4">
              <AlertCircle className="h-5 w-5 flex-shrink-0" />
              <span className="text-sm">{submitResult.message}</span>
            </div>
          )}
        </div>
      </div>

      <div className="flex justify-between pt-6 border-t border-gray-200 dark:border-gray-700">
        <button
          onClick={prevStep}
          disabled={isSubmitting}
          className="bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600 font-medium py-2 px-6 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50"
        >
          Back
        </button>
        <button
          onClick={handleSubmitOrder}
          disabled={!calculatedCosts || isSubmitting}
          className="flex items-center bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-6 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50"
        >
          {isSubmitting && <Loader2 className="animate-spin h-4 w-4 mr-2" />}
          Submit Order
        </button>
      </div>
    </div>
  );
};

export default Step3CostCalculation;
