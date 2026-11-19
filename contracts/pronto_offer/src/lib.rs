#![no_std]
//! Pronto — ofertas de cobro anticipado con descuento explícito.
//!
//! Flujo:
//!   1. `create_offer`  El comprador reserva el importe NETO en el contrato.
//!   2. `accept`        El proveedor designado acepta; el contrato le transfiere
//!                      el neto en la MISMA transacción y marca la oferta como ejecutada.
//!   3. `reclaim`       Si la oferta vence sin aceptación, el comprador recupera la reserva.
//!
//! Decisiones de seguridad:
//!   - Un solo activo por despliegue, fijado en el constructor (evita tokens falsos
//!     elegidos por el comprador).
//!   - `offer_id` (32 bytes) es aleatorio y NO deriva de datos de la factura, así nadie
//!     puede vincular la oferta con la empresa. El contrato rechaza ids repetidos; la
//!     regla "una oferta abierta por factura" la garantiza la clave única en la base.
//!   - Cada función privilegiada exige `require_auth()` de la parte correcta.
//!   - Estado cambia ANTES de mover fondos (checks-effects-interactions).
//!   - Duración máxima de oferta acotada para que el TTL de almacenamiento la cubra.

use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, token, Address, BytesN,
    Env,
};

/// ~5 s por ledger → 17 280 ledgers por día.
const DAY_IN_LEDGERS: u32 = 17_280;
const TTL_THRESHOLD: u32 = 7 * DAY_IN_LEDGERS;
const TTL_EXTEND_TO: u32 = 45 * DAY_IN_LEDGERS;
/// Una oferta no puede durar más de 30 días.
pub const MAX_OFFER_SECONDS: u64 = 30 * 24 * 60 * 60;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    OfferExists = 1,
    OfferNotFound = 2,
    InvalidAmount = 3,
    InvalidExpiry = 4,
    NotOpen = 5,
    Expired = 6,
    NotExpired = 7,
    SameParty = 8,
}

#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Status {
    Open,
    Accepted,
    Reclaimed,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Offer {
    pub buyer: Address,
    pub supplier: Address,
    /// Importe original de la factura (lo que el comprador pagaría al vencimiento).
    pub face: i128,
    /// Importe que el proveedor recibe hoy (face - descuento). Es lo que se reserva.
    pub net: i128,
    /// Marca de tiempo (segundos, ledger) desde la cual la oferta ya no se puede aceptar.
    pub expires_at: u64,
    pub status: Status,
}

#[contracttype]
enum DataKey {
    Token,
    Offer(BytesN<32>),
}

#[contractevent]
pub struct OfferCreated {
    #[topic]
    pub offer_id: BytesN<32>,
    pub buyer: Address,
    pub supplier: Address,
    pub face: i128,
    pub net: i128,
    pub expires_at: u64,
}

#[contractevent]
pub struct OfferAccepted {
    #[topic]
    pub offer_id: BytesN<32>,
    pub supplier: Address,
    pub net: i128,
}

#[contractevent]
pub struct OfferReclaimed {
    #[topic]
    pub offer_id: BytesN<32>,
    pub buyer: Address,
    pub net: i128,
}

#[contract]
pub struct ProntoOffer;

#[contractimpl]
impl ProntoOffer {
    /// Fija el activo (SAC o token SEP-41) con el que opera este despliegue.
    pub fn __constructor(env: Env, token: Address) {
        env.storage().instance().set(&DataKey::Token, &token);
    }

    /// El comprador reserva `net` y publica la oferta para `supplier`.
    pub fn create_offer(
        env: Env,
        offer_id: BytesN<32>,
        buyer: Address,
        supplier: Address,
        face: i128,
        net: i128,
        expires_at: u64,
    ) -> Result<(), Error> {
        buyer.require_auth();

        if buyer == supplier {
            return Err(Error::SameParty);
        }
        // Descuento explícito y estrictamente positivo: 0 < net < face.
        if net <= 0 || net >= face {
            return Err(Error::InvalidAmount);
        }
        let now = env.ledger().timestamp();
        let max_expiry = now
            .checked_add(MAX_OFFER_SECONDS)
            .ok_or(Error::InvalidExpiry)?;
        if expires_at <= now || expires_at > max_expiry {
            return Err(Error::InvalidExpiry);
        }

        let key = DataKey::Offer(offer_id.clone());
        if env.storage().persistent().has(&key) {
            return Err(Error::OfferExists);
        }

        // Efectos primero…
        let offer = Offer {
            buyer: buyer.clone(),
            supplier: supplier.clone(),
            face,
            net,
            expires_at,
            status: Status::Open,
        };
        env.storage().persistent().set(&key, &offer);
        Self::bump(&env, &key);

        // …interacción después: el comprador deposita el neto en el contrato.
        let token = Self::token_client(&env);
        token.transfer(&buyer, &env.current_contract_address(), &net);

        OfferCreated {
            offer_id,
            buyer,
            supplier,
            face,
            net,
            expires_at,
        }
        .publish(&env);
        Ok(())
    }

    /// El proveedor designado acepta: recibe el neto en la misma transacción.
    /// Una segunda aceptación sobre la misma oferta falla con `NotOpen`.
    pub fn accept(env: Env, offer_id: BytesN<32>) -> Result<(), Error> {
        let key = DataKey::Offer(offer_id.clone());
        let mut offer = Self::load(&env, &key)?;

        offer.supplier.require_auth();

        if offer.status != Status::Open {
            return Err(Error::NotOpen);
        }
        if env.ledger().timestamp() >= offer.expires_at {
            return Err(Error::Expired);
        }

        offer.status = Status::Accepted;
        env.storage().persistent().set(&key, &offer);
        Self::bump(&env, &key);

        let token = Self::token_client(&env);
        token.transfer(&env.current_contract_address(), &offer.supplier, &offer.net);

        OfferAccepted {
            offer_id,
            supplier: offer.supplier,
            net: offer.net,
        }
        .publish(&env);
        Ok(())
    }

    /// Si la oferta venció sin aceptación, el comprador recupera lo reservado.
    pub fn reclaim(env: Env, offer_id: BytesN<32>) -> Result<(), Error> {
        let key = DataKey::Offer(offer_id.clone());
        let mut offer = Self::load(&env, &key)?;

        offer.buyer.require_auth();

        if offer.status != Status::Open {
            return Err(Error::NotOpen);
        }
        if env.ledger().timestamp() < offer.expires_at {
            return Err(Error::NotExpired);
        }

        offer.status = Status::Reclaimed;
        env.storage().persistent().set(&key, &offer);
        Self::bump(&env, &key);

        let token = Self::token_client(&env);
        token.transfer(&env.current_contract_address(), &offer.buyer, &offer.net);

        OfferReclaimed {
            offer_id,
            buyer: offer.buyer,
            net: offer.net,
        }
        .publish(&env);
        Ok(())
    }

    /// Lectura: estado completo de una oferta.
    pub fn get_offer(env: Env, offer_id: BytesN<32>) -> Result<Offer, Error> {
        Self::load(&env, &DataKey::Offer(offer_id))
    }

    /// Lectura: activo con el que opera el contrato.
    pub fn token(env: Env) -> Address {
        env.storage().instance().get(&DataKey::Token).unwrap()
    }
}

impl ProntoOffer {
    fn load(env: &Env, key: &DataKey) -> Result<Offer, Error> {
        env.storage()
            .persistent()
            .get(key)
            .ok_or(Error::OfferNotFound)
    }

    fn token_client(env: &Env) -> token::Client<'_> {
        let addr: Address = env.storage().instance().get(&DataKey::Token).unwrap();
        env.storage()
            .instance()
            .extend_ttl(TTL_THRESHOLD, TTL_EXTEND_TO);
        token::Client::new(env, &addr)
    }

    fn bump(env: &Env, key: &DataKey) {
        env.storage()
            .persistent()
            .extend_ttl(key, TTL_THRESHOLD, TTL_EXTEND_TO);
    }
}

#[cfg(test)]
mod test;
