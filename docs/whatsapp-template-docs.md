Gerenciamento de modelos
Updated: 14 de nov de 2025
Conheça os pontos de extremidade comuns usados para gerenciar modelos.
Obter modelos
Use o ponto de extremidade GET/<WHATSAPP_BUSINESS_ACCOUNT_ID>/message_templates para obter uma lista de modelos em uma conta do WhatsApp Business.
Obter todos os modelos
Exemplo de solicitação para obter todos os modelos (campos padrão):
curl 'https://graph.facebook.com/v23.0/102290129340398/message_templates' \
-H 'Authorization: Bearer EAAJB...'

Exemplo de resposta truncada (...) para fins de concisão:
{
  "data": [
    {
      "name": "reservation_confirmation",
      "parameter_format": "NAMED",
      "components": [
        {
          "type": "HEADER",
          "format": "IMAGE",
          "example": {
            "header_handle": [
              "https://scontent.whatsapp.net/v/t61..."
            ]
          }
        },
        {
          "type": "BODY",
          "text": "*You're all set!*\n\nYour reservation for {{number_of_guests}} at Lucky Shrub Eatery on {{day}}, {{date}}, at {{time}}, is confirmed. See you then!",
          "example": {
            "body_text_named_params": [
              {
                "param_name": "number_of_guests",
                "example": "4"
              },
              {
                "param_name": "day",
                "example": "Saturday"
              },
              {
                "param_name": "date",
                "example": "August 30th, 2025"
              },
              {
                "param_name": "time",
                "example": "7:30 pm"
              }
            ]
          }
        },
        {
          "type": "FOOTER",
          "text": "Lucky Shrub Eatery: The Luckiest Eatery in Town!"
        },
        {
          "type": "BUTTONS",
          "buttons": [
            {
              "type": "URL",
              "text": "Change reservation",
              "url": "https://www.luckyshrubeater.com/reservations"
            },
            {
              "type": "PHONE_NUMBER",
              "text": "Call us",
              "phone_number": "+16467043595"
            },
            {
              "type": "QUICK_REPLY",
              "text": "Cancel reservation"
            }
          ]
        }
      ],
      "language": "en_US",
      "status": "APPROVED",
      "category": "UTILITY",
      "id": "1387372356726668"
    },
    {
      "name": "coupon_expiration_reminder_number_vars",
      "parameter_format": "POSITIONAL",
      "components": [
        {
          "type": "HEADER",
          "format": "TEXT",
          "text": "Act fast, {{1}}!",
          "example": {
            "header_text": [
              "Pablo"
            ]
          }
        },
        {
          "type": "BODY",
          "text": "Just a quick reminder—your exclusive coupon code, {{1}}, *expires in only {{2}} days!* Don’t miss out on our special deals. Use your code at checkout before it’s too late.\n\nHappy shopping! 😃",
          "example": {
            "body_text": [
              [
                "SUMMER20",
                "10"
              ]
            ]
          }
        },
        {
          "type": "FOOTER",
          "text": "Lucky Shrub Succulents"
        },
        {
          "type": "BUTTONS",
          "buttons": [
            {
              "type": "URL",
              "text": "See deals",
              "url": "https://www.luckyshrub.com/deals"
            },
            {
              "type": "QUICK_REPLY",
              "text": "Unsubscribe"
            }
          ]
        }
      ],
      "language": "en",
      "status": "APPROVED",
      "category": "MARKETING",
      "sub_category": "CUSTOM",
      "id": "1304694804498707"
    },

    ...

  ],
  "paging": {
    "cursors": {
      "before": "QVFIU...",
      "after": "QVFIU..."
    },
    "next": "https://graph.facebook.com/v23.0/10229..."
  }
}

Obter todos os modelos e campos específicos
Exemplo de solicitação para obter o nome, a categoria e o status de todos os modelos em uma conta do WhatsApp Business, limitando a resposta a 5 modelos por conjunto de resultados:
curl 'https://graph.facebook.com/v23.0/102290129340398/message_templates?fields=name,category,status&limit=5' \
-H 'Authorization: Bearer EAAJB...'

Exemplo de resposta:
{
  "data": [
    {
      "name": "reservation_confirmation",
      "category": "UTILITY",
      "status": "APPROVED",
      "id": "1387372356726668"
    },
    {
      "name": "coupon_expiration_reminder_number_vars",
      "category": "MARKETING",
      "status": "APPROVED",
      "id": "1304694804498707"
    },
    {
      "name": "coupon_expiration_reminder_named_vars",
      "category": "MARKETING",
      "status": "APPROVED",
      "id": "1625063511800527"
    },
    {
      "name": "address_update",
      "category": "UTILITY",
      "status": "PENDING",
      "id": "1137051647947973"
    },
    {
      "name": "reservation_confirmation_short_banner",
      "category": "UTILITY",
      "status": "REJECTED",
      "id": "1166414785519855"
    }
  ],
  "paging": {
    "cursors": {
      "before": "QVFIU...",
      "after": "QVFIU..."
    },
    "next": "https://graph.facebook.com/v23.0/10229..."
  }
}

Obter todos os modelos aprovados e rejeitados
Exemplo de solicitação para obter todos os modelos aprovados e os respectivos nomes, categorias e status (troque status=approved por status=rejected para obter modelos rejeitados):
curl 'https://graph.facebook.com/v23.0/102290129340398/message_templates?fields=name,category,status&status=approved' \
-H 'Authorization: Bearer EAAJB...'

Exemplo de resposta:
{
  "data": [
    {
      "name": "reservation_confirmation",
      "category": "UTILITY",
      "status": "APPROVED",
      "id": "1387372356726668"
    },
    {
      "name": "coupon_expiration_reminder_number_vars",
      "category": "MARKETING",
      "status": "APPROVED",
      "id": "1304694804498707"
    },
    {
      "name": "coupon_expiration_reminder_named_vars",
      "category": "MARKETING",
      "status": "APPROVED",
      "id": "1625063511800527"
    },
    {
      "name": "calling_permission_request",
      "category": "MARKETING",
      "status": "APPROVED",
      "id": "1092999222892024"
    },
    {
      "name": "location_request_v1",
      "category": "MARKETING",
      "status": "APPROVED",
      "id": "3373761659571648"
    },
    {
      "name": "order_confirmation",
      "category": "UTILITY",
      "status": "APPROVED",
      "id": "1667696820637468"
    }
  ],
  "paging": {
    "cursors": {
      "before": "QVFIU...",
      "after": "QVFIU..."
    },
    "next": "https://graph.facebook.com/v23.0/10229..."
  }
}

Editar modelos
Use o ponto de extremidade POST /<TEMPLATE_ID> para editar um modelo. Você também pode usar o painel Modelos de mensagem no Gerenciador do WhatsApp para editar modelos.
Limitações
É possível editar somente os modelos com status APPROVED, REJECTED ou PAUSED.
Só é possível editar a categoria, os componentes ou o tempo de vida de um modelo.
Não é possível editar componentes individuais do modelo. Todos os componentes serão substituídos por aqueles que estiverem na carga da solicitação de edição.
Não é possível editar a categoria de um modelo aprovado.
Os modelos aprovados podem ser editados até 10 vezes dentro de 30 dias ou uma vez dentro de 24 horas. Não há restrição para o número de edições de modelos rejeitados ou pausados.
Depois de editar um modelo aprovado ou pausado, ele será aprovado automaticamente, a não ser que seja reprovado na análise do modelo.
Editar categoria de modelo
Exemplo de solicitação:
curl 'https://graph.facebook.com/v23.0/1252715608684590' \
-H 'Content-Type: application/json' \
-H 'Authorization: Bearer EAAJB...' \
-d '
{
  "category": "MARKETING"
}'

Exemplo de resposta:
{
  "success": true
}

Editar componentes do modelo
Exemplo de solicitação para substituir componentes existentes de um modelo por novos componentes.
curl 'https://graph.facebook.com/v23.0/564750795574598' \
-H 'Content-Type: application/json' \
-H 'Authorization: Bearer EAAJB...' \
-d '
{
  "components": [
    {
      "type": "HEADER",
      "format": "TEXT",
      "text": "Our {{1}} is on!",
      "example": {
        "header_text": [
          "Spring Sale"
        ]
      }
    },
    {
      "type": "BODY",
      "text": "Shop now through {{1}} and use code {{2}} to get {{3}} off of all merchandise.",
      "example": {
        "body_text": [
          [
            "the end of April",
            "25OFF",
            "25%"
          ]
        ]
      }
    },
    {
      "type": "FOOTER",
      "text": "Use the buttons below to manage your marketing subscriptions"
    },
    {
      "type": "BUTTONS",
      "buttons": [
        {
          "type": "QUICK_REPLY",
          "text": "Unsubscribe from Promos"
        },
        {
          "type": "QUICK_REPLY",
          "text": "Unsubscribe from All"
        }
      ]
    }
  ]
}'

Excluir modelos
Use o ponto de extremidade DELETE /<WHATSAPP_BUSINESS_ACCOUNT_ID/message_templates para excluir um modelo por nome ou ID.
Limitações
Se você excluir um modelo enviado em uma mensagem que ainda não foi entregue (por exemplo, porque o telefone do cliente está desligado), o status do modelo será definido como PENDING_DELETION, e tentaremos entregar a mensagem por 30 dias. Se você tiver uma API Local, receberá um erro Structure Unavailable após esse período, e o cliente não receberá a mensagem.
Se você excluir um modelo aprovado, não será possível criar um novo modelo com o mesmo nome por 30 dias.
Os modelos com status desabilitado não podem ser excluídos.
Excluir modelo por nome
Ao excluir um modelo por nome, você removerá todos os modelos com essa nomenclatura. Isso significa que modelos com o mesmo nome, mas idiomas diferentes, também serão excluídos.
Exemplo de solicitação:
curl -X DELETE 'https://graph.facebook.com/v23.0/102290129340398/message_templates?name=order_confirmation' \
-H 'Authorization: Bearer EAAJB...'

Exemplo de resposta:
{
  "success": true
}

Excluir um modelo por identificação
Para excluir um modelo por identificação, inclua a identificação junto com o nome do modelo na sua solicitação. Apenas o modelo com essa identificação será excluído.
Exemplo de solicitação:
curl -X DELETE 'https://graph.facebook.com/v23.0/102290129340398/message_templates?hsm_id=1407680676729941&name=order_confirmation' \
-H 'Authorization: Bearer EAAJB...'

Exemplo de resposta:
{
  "success": true
}

Obter o namespace do modelo
Apenas usuários da API Local.
Use o ponto de extremidade GET /<WHATSAPP_BUSINESS_ACCOUNT_ID> e inclua o campo message_template_namespace para obter o namespace de um modelo.
Exemplo de sintaxe da solicitação:
curl 'https://graph.facebook.com/v23.0/102290129340398?fields=message_template_namespace' \
-H 'Authorization: Bearer EAAJB...'

Exemplo de resposta:
{
  "message_template_namespace": "ba30dd89_2ebd_41e4_b805_f2c05ae04cc9",
  "id": "102290129340398"
}

---

## Payload em botões de resposta rápida (envio)

No envio de um template, cada botão `QUICK_REPLY` aceita um payload próprio, devolvido intacto quando o
cliente toca no botão. É o que os botões de pesquisa (`RESPOSTA_PESQUISA`) usam para que a resposta
chegue sabendo a que envio responde (docs/dev-planning/survey-campaigns-plan.md §5.1).

Componente no payload de envio (`lib/message-templates/channels/whatsapp/send-payload.ts`):

```json
{
  "type": "button",
  "sub_type": "quick_reply",
  "index": "0",
  "parameters": [{ "type": "payload", "payload": "psq:<interactionId>:<opcaoValor>" }]
}
```

- `index` é a posição do botão no template (0-based), contando todos os botões.
- O payload tem no máximo 128 caracteres; o nosso fica em ≤105 (`psq:` + uuid + `:` + valor ≤64).
- Botões `QUICK_REPLY` sem componente no envio voltam com `payload` igual ao texto do botão.

O toque chega no webhook como mensagem `type: "button"`:

```json
{
  "type": "button",
  "button": { "text": "Morango", "payload": "psq:0f3c2a1e-…:MORANGO" },
  "context": { "from": "5511999999999", "id": "wamid.HBgN…" }
}
```

`context.id` é o wamid da mensagem de template respondida — é o fallback da captura quando o payload
não vem (`lib/campaigns/surveys/capture.ts`).
