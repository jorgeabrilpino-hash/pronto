#![cfg(test)]
extern crate std;

use super::*;
use soroban_sdk::{
    testutils::{Address as _, Ledger, MockAuth, MockAuthInvoke},
    token::{StellarAssetClient, TokenClient},
    Address, BytesN, Env, IntoVal,
};

const FACE: i128 = 1_000_0000000; // 1 000.0000000 unidades de prueba (7 decimales)
const NET: i128 = 985_0000000; // descuento de 15.0000000
const ONE_DAY: u64 = 24 * 60 * 60;

struct Fixture<'a> {
    env: Env,
    client: ProntoOfferClient<'a>,
    token: TokenClient<'a>,
    contract_id: Address,
    buyer: Address,
    supplier: Address,
}

fn setup<'a>() -> Fixture<'a> {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().with_mut(|l| l.timestamp = 1_000_000);

    let admin = Address::generate(&env);
    let sac = env.register_stellar_asset_contract_v2(admin);
    let token_addr = sac.address();

    let contract_id = env.register(ProntoOffer, (token_addr.clone(),));
    let client = ProntoOfferClient::new(&env, &contract_id);

    let buyer = Address::generate(&env);
    let supplier = Address::generate(&env);
    // El comprador tiene caja de sobra.
    StellarAssetClient::new(&env, &token_addr).mint(&buyer, &(5 * FACE));

    let token = TokenClient::new(&env, &token_addr);
    Fixture {
        env,
        client,
        token,
        contract_id,
        buyer,
        supplier,
    }
}

fn offer_id(env: &Env, n: u8) -> BytesN<32> {
    BytesN::from_array(env, &[n; 32])
}

fn expiry(f: &Fixture, days: u64) -> u64 {
    f.env.ledger().timestamp() + days * ONE_DAY
}

fn advance(f: &Fixture, secs: u64) {
    f.env.ledger().with_mut(|l| l.timestamp += secs);
}

#[test]
fn camino_feliz_crear_y_aceptar() {
    let f = setup();
    let id = offer_id(&f.env, 1);
    let before = f.token.balance(&f.buyer);

    f.client
        .create_offer(&id, &f.buyer, &f.supplier, &FACE, &NET, &expiry(&f, 7));

    // La reserva sale del comprador y queda en el contrato.
    assert_eq!(f.token.balance(&f.buyer), before - NET);
    assert_eq!(f.token.balance(&f.contract_id), NET);
    assert_eq!(f.client.get_offer(&id).status, Status::Open);

    f.client.accept(&id);

    // El proveedor cobra el neto hoy; el contrato queda en cero.
    assert_eq!(f.token.balance(&f.supplier), NET);
    assert_eq!(f.token.balance(&f.contract_id), 0);
    assert_eq!(f.client.get_offer(&id).status, Status::Accepted);
}

#[test]
fn segunda_aceptacion_falla_y_no_paga_dos_veces() {
    let f = setup();
    let id = offer_id(&f.env, 2);
    f.client
        .create_offer(&id, &f.buyer, &f.supplier, &FACE, &NET, &expiry(&f, 7));

    f.client.accept(&id);
    let second = f.client.try_accept(&id);

    assert_eq!(second, Err(Ok(Error::NotOpen)));
    assert_eq!(f.token.balance(&f.supplier), NET); // sigue cobrando una sola vez
    assert_eq!(f.token.balance(&f.contract_id), 0);
}

#[test]
fn oferta_vencida_no_se_acepta_y_el_comprador_recupera() {
    let f = setup();
    let id = offer_id(&f.env, 3);
    let before = f.token.balance(&f.buyer);
    f.client
        .create_offer(&id, &f.buyer, &f.supplier, &FACE, &NET, &expiry(&f, 1));

    // Antes del vencimiento no se puede recuperar.
    assert_eq!(f.client.try_reclaim(&id), Err(Ok(Error::NotExpired)));

    advance(&f, ONE_DAY); // exactamente en el vencimiento
    assert_eq!(f.client.try_accept(&id), Err(Ok(Error::Expired)));

    f.client.reclaim(&id);
    assert_eq!(f.token.balance(&f.buyer), before); // recuperó todo
    assert_eq!(f.token.balance(&f.contract_id), 0);
    assert_eq!(f.client.get_offer(&id).status, Status::Reclaimed);

    // No se puede recuperar dos veces ni aceptar después.
    assert_eq!(f.client.try_reclaim(&id), Err(Ok(Error::NotOpen)));
    assert_eq!(f.client.try_accept(&id), Err(Ok(Error::NotOpen)));
}

#[test]
fn una_oferta_aceptada_no_se_puede_recuperar() {
    let f = setup();
    let id = offer_id(&f.env, 4);
    f.client
        .create_offer(&id, &f.buyer, &f.supplier, &FACE, &NET, &expiry(&f, 1));
    f.client.accept(&id);
    advance(&f, 2 * ONE_DAY);

    assert_eq!(f.client.try_reclaim(&id), Err(Ok(Error::NotOpen)));
    assert_eq!(f.token.balance(&f.contract_id), 0);
}

#[test]
fn id_repetido_se_rechaza_incluso_tras_aceptar() {
    let f = setup();
    let id = offer_id(&f.env, 5);
    f.client
        .create_offer(&id, &f.buyer, &f.supplier, &FACE, &NET, &expiry(&f, 7));
    assert_eq!(
        f.client
            .try_create_offer(&id, &f.buyer, &f.supplier, &FACE, &NET, &expiry(&f, 7)),
        Err(Ok(Error::OfferExists))
    );

    f.client.accept(&id);
    assert_eq!(
        f.client
            .try_create_offer(&id, &f.buyer, &f.supplier, &FACE, &NET, &expiry(&f, 7)),
        Err(Ok(Error::OfferExists))
    );
}

#[test]
fn montos_y_vencimientos_invalidos() {
    let f = setup();
    let id = offer_id(&f.env, 6);
    let ok_exp = expiry(&f, 7);

    // Sin descuento, o neto mayor, o neto cero/negativo.
    for net in [FACE, FACE + 1, 0, -1] {
        assert_eq!(
            f.client
                .try_create_offer(&id, &f.buyer, &f.supplier, &FACE, &net, &ok_exp),
            Err(Ok(Error::InvalidAmount))
        );
    }
    // Vencimiento ya pasado, igual a ahora, o más allá de 30 días.
    let now = f.env.ledger().timestamp();
    for exp in [now - 1, now, now + MAX_OFFER_SECONDS + 1] {
        assert_eq!(
            f.client
                .try_create_offer(&id, &f.buyer, &f.supplier, &FACE, &NET, &exp),
            Err(Ok(Error::InvalidExpiry))
        );
    }
    // Comprador y proveedor no pueden ser la misma cuenta.
    assert_eq!(
        f.client
            .try_create_offer(&id, &f.buyer, &f.buyer, &FACE, &NET, &ok_exp),
        Err(Ok(Error::SameParty))
    );
    // Nada de lo anterior dejó rastro.
    assert_eq!(f.client.try_get_offer(&id), Err(Ok(Error::OfferNotFound)));
}

#[test]
fn comprador_sin_fondos_no_crea_oferta() {
    let f = setup();
    let id = offer_id(&f.env, 7);
    let pobre = Address::generate(&f.env); // sin saldo

    let res = f
        .client
        .try_create_offer(&id, &pobre, &f.supplier, &FACE, &NET, &expiry(&f, 7));
    assert!(res.is_err());
    // La transacción se revierte completa: no queda oferta fantasma.
    assert_eq!(f.client.try_get_offer(&id), Err(Ok(Error::OfferNotFound)));
}

#[test]
fn solo_el_proveedor_designado_puede_aceptar() {
    let f = setup();
    let id = offer_id(&f.env, 8);
    f.client
        .create_offer(&id, &f.buyer, &f.supplier, &FACE, &NET, &expiry(&f, 7));

    // Un tercero firma la llamada: debe fallar la autorización.
    let intruso = Address::generate(&f.env);
    f.env.mock_auths(&[MockAuth {
        address: &intruso,
        invoke: &MockAuthInvoke {
            contract: &f.contract_id,
            fn_name: "accept",
            args: (id.clone(),).into_val(&f.env),
            sub_invokes: &[],
        },
    }]);
    assert!(f.client.try_accept(&id).is_err());
    assert_eq!(f.token.balance(&f.supplier), 0);
    assert_eq!(f.client.get_offer(&id).status, Status::Open);
}

#[test]
fn solo_el_comprador_puede_recuperar() {
    let f = setup();
    let id = offer_id(&f.env, 9);
    f.client
        .create_offer(&id, &f.buyer, &f.supplier, &FACE, &NET, &expiry(&f, 1));
    advance(&f, ONE_DAY);

    let intruso = Address::generate(&f.env);
    f.env.mock_auths(&[MockAuth {
        address: &intruso,
        invoke: &MockAuthInvoke {
            contract: &f.contract_id,
            fn_name: "reclaim",
            args: (id.clone(),).into_val(&f.env),
            sub_invokes: &[],
        },
    }]);
    assert!(f.client.try_reclaim(&id).is_err());
    assert_eq!(f.token.balance(&f.contract_id), NET); // la reserva sigue intacta
}

#[test]
fn aceptar_oferta_inexistente() {
    let f = setup();
    assert_eq!(
        f.client.try_accept(&offer_id(&f.env, 99)),
        Err(Ok(Error::OfferNotFound))
    );
}

#[test]
fn varias_ofertas_son_independientes() {
    let f = setup();
    let a = offer_id(&f.env, 10);
    let b = offer_id(&f.env, 11);
    f.client
        .create_offer(&a, &f.buyer, &f.supplier, &FACE, &NET, &expiry(&f, 7));
    f.client
        .create_offer(&b, &f.buyer, &f.supplier, &FACE, &NET, &expiry(&f, 7));
    assert_eq!(f.token.balance(&f.contract_id), 2 * NET);

    f.client.accept(&a);
    assert_eq!(f.token.balance(&f.contract_id), NET);
    assert_eq!(f.client.get_offer(&b).status, Status::Open);
}
