<?php
/**
 * VivereShop Oficina – Contador de usuarios esperando aprobación (Ultimate Member)
 * ---------------------------------------------------------------
 * Pégalo en Code Snippets > Agregar nuevo > tipo PHP > "Ejecutar en todas partes" > Activar.
 * Cambia la clave de abajo por una tuya (letras y números).
 *
 * URL para la oficina:  https://vivereshop.com/wp-json/oficina/v1/pendientes
 * Clave:                la que pongas aquí
 *
 * Así Zapi (tu agente de ZapIA) sabe cuándo hay usuarios por aprobar:
 * si hay pendientes se sienta a trabajar; si no, se va por un cafecito.
 */
if ( ! defined( 'VHQ_PENDIENTES_KEY' ) ) {
	define( 'VHQ_PENDIENTES_KEY', 'CAMBIA-ESTA-CLAVE-2026' );
}

add_action( 'rest_api_init', function () {
	register_rest_route( 'oficina/v1', '/pendientes', array(
		'methods'             => 'GET',
		'permission_callback' => '__return_true',
		'callback'            => function ( WP_REST_Request $req ) {
			$key = (string) $req->get_param( 'key' );
			if ( ! hash_equals( VHQ_PENDIENTES_KEY, $key ) ) {
				return new WP_Error( 'vhq_forbidden', 'Clave incorrecta', array( 'status' => 403 ) );
			}
			$q = new WP_User_Query( array(
				'meta_key'    => 'account_status',            // Ultimate Member
				'meta_value'  => 'awaiting_admin_review',     // "Pendiente de revisión"
				'number'      => 20,
				'orderby'     => 'registered',
				'order'       => 'DESC',
				'count_total' => true,
				'fields'      => array( 'ID', 'display_name', 'user_email', 'user_registered' ),
			) );
			$users = array();
			foreach ( $q->get_results() as $u ) {
				$users[] = array(
					'name'       => $u->display_name,
					'email'      => $u->user_email,
					'registered' => mysql2date( 'c', $u->user_registered ),
				);
			}
			$res = new WP_REST_Response( array( 'count' => (int) $q->get_total(), 'users' => $users ) );
			$res->header( 'Cache-Control', 'no-store, max-age=0' );
			return $res;
		},
	) );
} );
