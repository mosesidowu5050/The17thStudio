const validator = require('@app-core/validator');
const { throwAppError, ERROR_CODE } = require('@app-core/errors');
const { appLogger } = require('@app-core/logger');
const { randomBytes } = require('@app-core/randomness');
const CreatorCardMessages = require('@app/messages/creator-card');
const creatorCardRepository = require('@app/repository/creator-card');

// ---------------------------------------------------------------------------
// VSL validation spec
// Handles: required fields, types, string lengths, enum values
// Does NOT handle: url prefix, integer check on amount, conditional non-empty
//   rates[] — those are handled as business rules below.
// ---------------------------------------------------------------------------
const spec = `root {
  title string<trim|minLength:3|maxLength:100>
  description? string<trim|maxLength:500>
  slug? string<trim|minLength:5|maxLength:50>
  creator_reference string<trim|length:20>
  links[]? {
    title string<trim|minLength:1|maxLength:100>
    url string<trim|maxLength:200>
  }
  service_rates? {
    currency string(NGN|USD|GBP|GHS)
    rates[] {
      name string<trim|minLength:3|maxLength:100>
      description? string<trim|maxLength:250>
      amount number<min:1>
    }
  }
  status string(draft|published)
  access_type? string(public|private)
  access_code? string<trim|length:6>
}`;

const parsedSpec = validator.parse(spec);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns true if every character in str is a letter or digit (alphanumeric).
 */
function isAlphanumeric(str) {
  let i = 0;
  while (i < str.length) {
    const c = str.charCodeAt(i);
    const isDigit = c >= 48 && c <= 57;
    const isLower = c >= 97 && c <= 122;
    const isUpper = c >= 65 && c <= 90;
    if (!isDigit && !isLower && !isUpper) return false;
    i += 1;
  }
  return true;
}

/**
 * Returns true if ch is a valid slug character:
 * letter (a-z A-Z), digit (0-9), hyphen (-), or underscore (_).
 */
function isValidSlugChar(ch) {
  const c = ch.charCodeAt(0);
  const isDigit = c >= 48 && c <= 57;
  const isLower = c >= 97 && c <= 122;
  const isUpper = c >= 65 && c <= 90;
  return isDigit || isLower || isUpper || ch === '-' || ch === '_';
}

/**
 * Validate that every character in a slug string is allowed.
 * Returns false if any character is invalid.
 */
function isValidSlug(slug) {
  let i = 0;
  while (i < slug.length) {
    if (!isValidSlugChar(slug[i])) return false;
    i += 1;
  }
  return true;
}

/**
 * Appends a hyphen + suffix to a base slug.
 * If base is empty, returns suffix alone.
 */
function appendSuffix(base, suffix) {
  const parts = [];
  if (base.length > 0) parts.push(base);
  parts.push(suffix);
  return parts.join('-');
}

/**
 * Derives a slug from a title:
 *   1. Lowercase
 *   2. Replace runs of whitespace with a single hyphen
 *   3. Strip characters that are not letters, digits, hyphens, or underscores
 *   4. Strip leading/trailing hyphens
 */
function slugifyTitle(title) {
  const lower = title.toLowerCase();
  let result = '';
  let i = 0;

  while (i < lower.length) {
    const ch = lower[i];
    const isWhitespace = ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r';

    if (isWhitespace) {
      // avoid leading or double hyphens
      if (result.length > 0 && result[result.length - 1] !== '-') {
        result += '-';
      }
    } else if (isValidSlugChar(ch)) {
      result += ch;
    }
    i += 1;
  }

  // strip trailing hyphen
  while (result.length > 0 && result[result.length - 1] === '-') {
    result = result.slice(0, -1);
  }

  return result;
}

/**
 * Returns true if n is a positive integer (no decimals, no negatives, no zero).
 */
function isPositiveInteger(n) {
  return typeof n === 'number' && n > 0 && Math.floor(n) === n;
}

/**
 * Serialize a raw MongoDB document into the API response shape.
 * - Maps _id → id (never exposes _id)
 * - access_code only included when opts.includeAccessCode is true
 *
 * @param {Object} doc - Raw lean Mongoose document
 * @param {{ includeAccessCode: boolean }} opts
 */
function serializeCard(doc, opts = {}) {
  const card = {
    id: doc._id,
    title: doc.title,
    description: doc.description !== undefined && doc.description !== null ? doc.description : null,
    slug: doc.slug,
    creator_reference: doc.creator_reference,
    links: doc.links || [],
    service_rates: doc.service_rates || null,
    status: doc.status,
    access_type: doc.access_type,
    created: doc.created,
    updated: doc.updated,
    deleted: doc.deleted !== undefined && doc.deleted !== null ? doc.deleted : null,
  };

  if (opts.includeAccessCode) {
    card.access_code = doc.access_code || null;
  }

  return card;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

async function createCreatorCard(serviceData) {
  let response;

  // Normalize: treat empty or whitespace-only slug as omitted so auto-generation kicks in
  const normalizedInput = Object.assign({}, serviceData);
  if (typeof normalizedInput.slug === 'string' && normalizedInput.slug.trim().length === 0) {
    delete normalizedInput.slug;
  }

  // Step 1 — Field-level validation via VSL (types, lengths, enums)
  const data = validator.validate(normalizedInput, parsedSpec);

  // Step 2 — Validate links[].url must start with http:// or https://
  if (data.links && data.links.length > 0) {
    let li = 0;
    while (li < data.links.length) {
      const link = data.links[li];
      const url = link.url || '';
      const startsHttp = url.indexOf('http://') === 0;
      const startsHttps = url.indexOf('https://') === 0;
      if (!startsHttp && !startsHttps) {
        throwAppError('Each link URL must start with http:// or https://', ERROR_CODE.INVLDDATA);
      }
      li += 1;
    }
  }

  // Step 3 — Validate service_rates business rules
  if (data.service_rates) {
    const { rates } = data.service_rates;

    // rates must be a non-empty array
    if (!rates || !Array.isArray(rates) || rates.length === 0) {
      throwAppError(
        'service_rates.rates must be a non-empty array when service_rates is provided',
        ERROR_CODE.INVLDDATA
      );
    }

    // Each rate amount must be a positive integer (no decimals)
    let ri = 0;
    while (ri < rates.length) {
      if (!isPositiveInteger(rates[ri].amount)) {
        throwAppError(
          'Each rate amount must be a positive integer (no decimals, no zero, no negatives)',
          ERROR_CODE.INVLDDATA
        );
      }
      ri += 1;
    }
  }

  // Step 4 — Resolve access_type default
  const accessType = data.access_type || 'public';
  const accessCode = data.access_code || null;

  // Step 5 — Business rule: access_code required when access_type is private (AC01)
  if (accessType === 'private' && !accessCode) {
    throwAppError(CreatorCardMessages.ACCESS_CODE_REQUIRED, ERROR_CODE.INVLDDATA, {
      businessCode: 'AC01',
    });
  }

  // Step 6 — Business rule: access_code must NOT be set on public cards (AC05)
  if (accessType === 'public' && accessCode) {
    throwAppError(CreatorCardMessages.ACCESS_CODE_NOT_ALLOWED, ERROR_CODE.INVLDDATA, {
      businessCode: 'AC05',
    });
  }

  // Step 7 — access_code must be alphanumeric only (letters and numbers, no special chars)
  if (accessCode && !isAlphanumeric(accessCode)) {
    throwAppError('access_code must contain only letters and numbers', ERROR_CODE.INVLDDATA);
  }

  // Step 8 — Slug handling
  let slug;
  const clientProvidedSlug = data.slug || null;

  if (clientProvidedSlug) {
    // Validate slug characters: letters, numbers, hyphens, underscores only
    if (!isValidSlug(clientProvidedSlug)) {
      throwAppError(
        'Slug may only contain letters, numbers, hyphens, and underscores',
        ERROR_CODE.INVLDDATA
      );
    }

    // Client-provided slug: check uniqueness; NEVER silently modify → SL02
    const existing = await creatorCardRepository.findOne({
      query: { slug: clientProvidedSlug, deleted: null },
    });
    if (existing) {
      throwAppError(CreatorCardMessages.SLUG_TAKEN, ERROR_CODE.INVLDDATA, {
        businessCode: 'SL02',
      });
    }

    slug = clientProvidedSlug;
  } else {
    // Auto-generate slug from title
    const base = slugifyTitle(data.title);
    let candidate = base;

    if (candidate.length < 5) {
      // Too short - append a random 6-char suffix immediately
      const suffix = randomBytes(6);
      candidate = appendSuffix(candidate, suffix);
    } else {
      // Long enough - only append suffix if already taken
      const existing = await creatorCardRepository.findOne({
        query: { slug: candidate, deleted: null },
      });
      if (existing) {
        const suffix = randomBytes(6);
        candidate = appendSuffix(candidate, suffix);
      }
    }

    slug = candidate;
  }

  // Step 9 — Persist the card
  const payload = {
    title: data.title,
    description: data.description || null,
    slug,
    creator_reference: data.creator_reference,
    links: data.links || [],
    service_rates: data.service_rates || null,
    status: data.status,
    access_type: accessType,
    access_code: accessCode,
    deleted: null,
  };

  try {
    const created = await creatorCardRepository.create(payload);
    // access_code IS returned in the creation response (the creator needs it)
    response = serializeCard(created, { includeAccessCode: true });
  } catch (err) {
    appLogger.errorX(err, 'create-creator-card-error');
    throw err;
  }

  return response;
}

module.exports = createCreatorCard;
module.exports.serializeCard = serializeCard;
