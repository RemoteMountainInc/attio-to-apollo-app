import React, { useState, useEffect } from 'react';

// Define configuration

export const config = {

  name: 'Apollo Sync',

  description: 'Two-way sync between Apollo and Attio',

  settings: [

    {

      key: 'T5bIsBmqjmKodPMn_nT6wQ',

      label: 'Apollo API Key',

      type: 'string',

      secret: true,

      required: true

    }

  ],

  scopes: [

    'record:read',

    'record:write',

    'object:read'

  ]

};

// Main component

function ApolloSync() {

  const [loading, setLoading] = useState(false);

  const [message, setMessage] = useState('');

  const [settings, setSettings] = useState(null);

  useEffect(() => {

    // Load settings when component mounts

    loadSettings();

  }, []);

  const loadSettings = async () => {

    try {

      // This will be provided by Attio's runtime

      if (window.Attio && window.Attio.getSettings) {

        const appSettings = await window.Attio.getSettings();

        setSettings(appSettings);

      }

    } catch (error) {

      console.error('Failed to load settings:', error);

    }

  };

  const syncFromApollo = async () => {

    if (!settings?.apollo_api_key) {

      setMessage('❌ Please configure Apollo API key in settings');

      return;

    }

    setLoading(true);

    setMessage('🔄 Syncing from Apollo...');

    try {

      // Fetch from Apollo

      const response = await fetch('https://api.apollo.io/v1/contacts/search', {

        method: 'POST',

        headers: { 'Content-Type': 'application/json' },

        body: JSON.stringify({

          api_key: settings.apollo_api_key,

          per_page: 10,

          page: 1

        })

      });

      const data = await response.json();

      const contacts = data.contacts || [];

      let created = 0;

      let updated = 0;

      // Process each contact

      for (const contact of contacts) {

        if (!contact.email) continue;

        try {

          // Use Attio API

          const attioApi = window.Attio.api;

          

          // Search for existing

          const existing = await attioApi.post('/v2/objects/people/records/query', {

            filter: {

              or: [{

                attribute: 'email_addresses',

                relation: 'contains',

                value: contact.email

              }]

            }

          });

          const personData = {

            values: {

              name: {

                first_name: contact.first_name || '',

                last_name: contact.last_name || ''

              },

              email_addresses: [{

                email_address: contact.email,

                email_address_type: 'work'

              }]

            }

          };

          if (existing.data?.data?.length > 0) {

            // Update

            await attioApi.patch(`/v2/objects/people/records/${existing.data.data[0].id.record_id}`, {

              data: personData

            });

            updated++;

          } else {

            // Create

            await attioApi.post('/v2/objects/people/records', {

              data: personData

            });

            created++;

          }

        } catch (err) {

          console.error('Error processing contact:', err);

        }

      }

      setMessage(`✅ Done! Created: ${created}, Updated: ${updated}`);

    } catch (error) {

      setMessage(`❌ Error: ${error.message}`);

    }

    setLoading(false);

  };

  const syncToApollo = async () => {

    if (!settings?.apollo_api_key) {

      setMessage('❌ Please configure Apollo API key in settings');

      return;

    }

    setLoading(true);

    setMessage('🔄 Syncing to Apollo...');

    try {

      const attioApi = window.Attio.api;

      

      // Get Attio contacts

      const response = await attioApi.get('/v2/objects/people/records?limit=10');

      const contacts = response.data?.data || [];

      let created = 0;

      let updated = 0;

      for (const contact of contacts) {

        const email = contact.values?.email_addresses?.[0]?.email_address;

        if (!email) continue;

        // Check Apollo

        const searchRes = await fetch('https://api.apollo.io/v1/contacts/search', {

          method: 'POST',

          headers: { 'Content-Type': 'application/json' },

          body: JSON.stringify({

            api_key: settings.apollo_api_key,

            q_keywords: email

          })

        });

        const searchData = await searchRes.json();

        

        const apolloData = {

          api_key: settings.apollo_api_key,

          email: email,

          first_name: contact.values?.name?.first_name || '',

          last_name: contact.values?.name?.last_name || ''

        };

        if (searchData.contacts?.length > 0) {

          // Update

          await fetch(`https://api.apollo.io/v1/contacts/${searchData.contacts[0].id}`, {

            method: 'PATCH',

            headers: { 'Content-Type': 'application/json' },

            body: JSON.stringify(apolloData)

          });

          updated++;

        } else {

          // Create

          await fetch('https://api.apollo.io/v1/contacts', {

            method: 'POST',

            headers: { 'Content-Type': 'application/json' },

            body: JSON.stringify(apolloData)

          });

          created++;

        }

        // Rate limit

        await new Promise(r => setTimeout(r, 3000));

      }

      setMessage(`✅ Done! Created: ${created}, Updated: ${updated}`);

    } catch (error) {

      setMessage(`❌ Error: ${error.message}`);

    }

    setLoading(false);

  };

  return (

    <div style={{ padding: '20px' }}>

      <h2>🔄 Apollo ↔️ Attio Sync</h2>

      

      <div style={{ marginBottom: '20px' }}>

        <p>Sync contacts between Apollo.io and Attio</p>

        {!settings?.apollo_api_key && (

          <p style={{ color: 'orange' }}>⚠️ Configure Apollo API key in settings first</p>

        )}

      </div>

      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>

        <button 

          onClick={syncFromApollo}

          disabled={loading}

          style={{

            padding: '10px 20px',

            background: '#007bff',

            color: 'white',

            border: 'none',

            borderRadius: '5px',

            cursor: loading ? 'not-allowed' : 'pointer',

            opacity: loading ? 0.5 : 1

          }}

        >

          ⬇️ Pull from Apollo

        </button>

        

        <button 

          onClick={syncToApollo}

          disabled={loading}

          style={{

            padding: '10px 20px',

            background: '#28a745',

            color: 'white',

            border: 'none',

            borderRadius: '5px',

            cursor: loading ? 'not-allowed' : 'pointer',

            opacity: loading ? 0.5 : 1

          }}

        >

          ⬆️ Push to Apollo

        </button>

      </div>

      {message && (

        <div style={{

          padding: '10px',

          background: message.startsWith('✅') ? '#d4edda' : message.startsWith('❌') ? '#f8d7da' : '#d1ecf1',

          borderRadius: '5px',

          marginTop: '10px'

        }}>

          {message}

        </div>

      )}

    </div>

  );

}

export default ApolloSync;

