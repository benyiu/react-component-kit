// Frontend display values. The API stores the corresponding enum names.
const ENUMS = {
  CLIENT_TYPE: { INDIVIDUAL: '個人', CORP: '法團(有限公司)', PARTNERSHIP: '合夥(無限公司)' },
  REVIEW_APPROVAL_DECISION: { PENDING: '未審批', REVIEW_APPROVED: '已批准', REJECTED: '不批准', EDD: '需進一步審查 (EDD)' },
  RISK_APPROVAL_STATUS: { PENDING: '未審批', RISK_APPROVED: '已審批' },
  RISK_RATING: { LOW: '低', MEDIUM: '中', HIGH: '高' },
  ASSESSMENT_RISK_RATING: { LOW: '低風險', MEDIUM_LOW: '中低風險', MEDIUM: '中等風險', MEDIUM_HIGH: '中高風險', HIGH: '高風險' },
  REVIEW_TYPE: { INITIAL: '初次審查', PERIODIC: '定期監測', PRE_TRANSACTION: '交易前審查' },
  REG_TYPE: { A_LICENSE: 'A 牌', B_LICENSE: 'B 牌', UNLICENSED: '無牌' },
  TXN_TYPE: { RECEIVE: '收款', PAY: '支付' },
  // API compatibility values for the document-category enum. D1 stores the
  // semantic names while the client keeps stable widget keys.
  DOCUMENT_CATEGORY: { BR: 'docBR', BO_ID: 'docBOID', ANNUAL_RETURN: 'docAnnual', BUSINESS_CARD: 'docBizCard', AUTHORIZATION_LETTER: 'docAuthLetter', B_LICENSE: 'docBLicense', CERTIFICATE_OF_INCORPORATION: 'docCI', BUSINESS_PREMISES_PHOTO: 'docBizPhoto', TRANSACTION_PHOTO: 'docTradePhoto', CDD_SCREENSHOT: 'docCcdScreenshot', OTHER: 'docOther' },
  LICENSE_VALIDITY: { VALID: '有效', INVALID: '無效' },
  ADDRESS_TYPE: { MAIN: 'MAIN', CORR: 'CORR', BUS_PREM: 'BUS_PREM', TEMP_PREM: 'TEMP_PREM', OTHER: 'OTHER' },
  TXN_LOCATION: { SELF: '本公司', COUNTERPARTY: '對方公司', OTHER: '其他' },
  JURISDICTION: { NK: '是 - 北韓', MM: '是 - 緬甸', IR: '是 - 伊朗', ENHANCED: '是 - 其他加強監察司法管轄區', NONE: '否' },
  VISIBILITY: { PUBLIC: 'public', PRIVATE: 'private' },
  INVITATION_STATUS: { PENDING: 'pending', ACCEPTED: 'accepted', REVOKED: 'revoked', EXPIRED: 'expired' },
};

// DRS address categories map directly onto ADDRESS_TYPE. Unknown or missing
// values remain user-selectable as "Other".
function fDrsAddressType(rectype) {
  const key = String(rectype || '').trim();
  return Object.prototype.hasOwnProperty.call(ENUMS.ADDRESS_TYPE, key)
    ? ENUMS.ADDRESS_TYPE[key]
    : ENUMS.ADDRESS_TYPE.OTHER;
}

const ADDRESS_TYPE_LEGACY = {
  '主營業地址': ENUMS.ADDRESS_TYPE.MAIN,
  '通訊地址': ENUMS.ADDRESS_TYPE.CORR,
  '分行': ENUMS.ADDRESS_TYPE.BUS_PREM,
  '臨時營業地點': ENUMS.ADDRESS_TYPE.TEMP_PREM,
  '其他': ENUMS.ADDRESS_TYPE.OTHER,
};

const ADDRESS_TYPE_I18N = {
  MAIN: 'client.f.addrMain',
  CORR: 'client.f.addrCorr',
  BUS_PREM: 'client.f.addrBranch',
  TEMP_PREM: 'client.f.addrTemp',
  OTHER: 'client.f.addrOther',
};

let enumTranslate = (key) => key;

function configureEnumTranslation(translate) {
  enumTranslate = typeof translate === 'function' ? translate : enumTranslate;
}

function fNormalizeAddressType(type) {
  const raw = String(type || '').trim();
  return Object.prototype.hasOwnProperty.call(ADDRESS_TYPE_I18N, raw)
    ? raw
    : (ADDRESS_TYPE_LEGACY[raw] || ENUMS.ADDRESS_TYPE.OTHER);
}

function fAddressTypeLabel(type) {
  return enumTranslate(ADDRESS_TYPE_I18N[fNormalizeAddressType(type)]);
}

// Registry lookups append new addresses and never overwrite user-maintained
// rows. Normalization is shared by DRS and Companies Registry integrations.
const AddressLookupMerge = (() => {
  function normalizeDetail(detail) {
    let value = String(detail || '');
    if (value.normalize) value = value.normalize('NFKC');
    return value.replace(/[\s\u00a0]+/g, ' ').trim().toLocaleLowerCase('en-HK');
  }

  function inspect(addresses, type, detail) {
    const normalizedType = fNormalizeAddressType(type);
    const normalizedDetail = normalizeDetail(detail);
    const list = Array.isArray(addresses) ? addresses : [];
    let exact = null;
    const sameType = [];
    const sameDetailOtherType = [];
    for (let index = 0; index < list.length; index += 1) {
      const item = list[index] || {};
      const itemType = fNormalizeAddressType(item.type);
      const itemDetail = normalizeDetail(item.detail);
      if (itemType === normalizedType) sameType.push(item);
      if (normalizedDetail && itemDetail === normalizedDetail) {
        if (itemType === normalizedType) exact = item;
        else sameDetailOtherType.push(item);
      }
    }
    return {
      type: normalizedType,
      detail: String(detail || '').trim(),
      exact,
      sameType,
      sameDetailOtherType,
      canAdd: Boolean(normalizedDetail && !exact),
    };
  }

  function append(addresses, type, detail) {
    const current = Array.isArray(addresses) ? addresses : [];
    const proposal = inspect(current, type, detail);
    if (!proposal.canAdd) return { added: false, addresses: current, proposal };
    const next = current.slice();
    next.push({ type: proposal.type, detail: proposal.detail, isDefault: next.length === 0 });
    return { added: true, addresses: next, proposal };
  }

  return { normalizeDetail, inspect, append };
})();

function fAddressPairMatches(address, type, detail) {
  return Boolean(AddressLookupMerge.inspect([address], type, detail).exact);
}

export {
  ENUMS,
  ADDRESS_TYPE_LEGACY,
  ADDRESS_TYPE_I18N,
  AddressLookupMerge,
  configureEnumTranslation,
  fDrsAddressType,
  fNormalizeAddressType,
  fAddressTypeLabel,
  fAddressPairMatches,
};
