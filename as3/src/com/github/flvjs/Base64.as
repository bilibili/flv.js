////////////////////////////////////////////////////////////////////////////////
//
//  © 2010 BlooDHounD
//
//  This file is part of blooddy_crypto project, licensed under MIT License
//
////////////////////////////////////////////////////////////////////////////////

package com.github.flvjs {

	import flash.system.ApplicationDomain;
	import flash.utils.ByteArray;

	import avm2.intrinsics.memory.li8;
	import avm2.intrinsics.memory.si16;
	import avm2.intrinsics.memory.si8;

	/**
	 * Encodes and decodes binary data using Base64 encoding algorithm.
	 *
	 * @see		http://www.faqs.org/rfcs/rfc4648.html	RFC
	 *
	 * @author					BlooDHounD
	 * @version					3.0
	 * @playerversion			Flash 10.1
	 * @langversion				3.0
	 */
	public final class Base64 {

		//--------------------------------------------------------------------------
		//
		//  Class variables
		//
		//--------------------------------------------------------------------------

		/**
		 * @private
		 */
		private static const _DOMAIN:ApplicationDomain = ApplicationDomain.currentDomain;

		/**
		 * @private
		 */
		private static const _ENCODE_TABLE:ByteArray = new ByteArray();
		_ENCODE_TABLE.writeUTFBytes(
			'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
		);

		/**
		 * @private
		 */
		private static const _DECODE_TABLE:ByteArray = new ByteArray();
		_DECODE_TABLE.writeUTFBytes(
			'\x40\x40\x40\x40\x40\x40\x40\x40\x43\x43\x43\x43\x43\x43\x40\x40\x40\x40\x40\x40\x40\x40\x40\x40\x40\x40\x40\x40\x40\x40\x40\x40\x43\x40\x40\x40\x40\x40\x40\x40\x40\x40\x40\x3e\x40\x40\x40\x3f\x34\x35\x36\x37\x38\x39\x3a\x3b\x3c\x3d\x40\x40\x40\x41\x40\x40\x40\x00\x01\x02\x03\x04\x05\x06\x07\x08\x09\x0a\x0b\x0c\x0d\x0e\x0f\x10\x11\x12\x13\x14\x15\x16\x17\x18\x19\x40\x40\x40\x40\x40\x40\x1a\x1b\x1c\x1d\x1e\x1f\x20\x21\x22\x23\x24\x25\x26\x27\x28\x29\x2a\x2b\x2c\x2d\x2e\x2f\x30\x31\x32\x33\x40\x40\x40\x40\x40' +
			'\x40\x40\x40\x40\x40\x40\x40\x40\x40\x40\x40\x40\x40\x40\x40\x40\x40\x40\x40\x40\x40\x40\x40\x40\x40\x40\x40\x40\x40\x40\x40\x40\x40\x40\x40\x40\x40\x40\x40\x40\x40\x40\x40\x40\x40\x40\x40\x40\x40\x40\x40\x40\x40\x40\x40\x40\x40\x40\x40\x40\x40\x40\x40\x40\x40\x40\x40\x40\x40\x40\x40\x40\x40\x40\x40\x40\x40\x40\x40\x40\x40\x40\x40\x40\x40\x40\x40\x40\x40\x40\x40\x40\x40\x40\x40\x40\x40\x40\x40\x40\x40\x40\x40\x40\x40\x40\x40\x40\x40\x40\x40\x40\x40\x40\x40\x40\x40\x40\x40\x40\x40\x40\x40\x40\x40\x40\x40\x40'
		);

		//--------------------------------------------------------------------------
		//
		//  Class methods
		//
		//--------------------------------------------------------------------------

		/**
		 * @param	str		Base64 string.
		 *
		 * @return			<code>true</code> if <code>str</code> is valid Base64 string.
		 */
		public static function isValid(str:String):Boolean {
			return /^[A-Za-z\d\+\/\s\v\b]*[=\s\v\b]*$/.test( str );
		}

		/**
		 * Encodes the <code>ByteArray</code> using Base64 encoding algorithm.
		 *
		 * @param	bytes			The <code>ByteArray</code> to be encoded.
		 *
		 * @param	insertNewLines	If <code>insertNewLines &gt; 0</code> passed, the resulting
		 * 							string will contain line breaks.
		 *
		 * @return					The encoded Base64 string data.
		 */
		public static function encode(bytes:ByteArray, newLines:uint=0):String {

			if ( newLines & 3 )	throw new RangeError();

			if ( !bytes || bytes.length <= 0 ) return '';

			var tmp:ByteArray = _DOMAIN.domainMemory;

			var insertNewLines:Boolean = newLines != 0;
			var len:uint = Math.ceil( bytes.length / 3 ) << 2;
			if ( insertNewLines ) {
				len += ( int( len / newLines + 0.5 ) - 1 ) << 1; // переносы занимают дополнительные байтики
				newLines *= 0.75; // переносы будем отсчитывать по исходнику. поэтому отсчитывать надо по 3 байта
			}

			var i:int = 63 + len - bytes.length + 2; // сюда запишем данные для кодирования
			if ( insertNewLines ) {
				// что бы не производить допрасчёты, сдвинем для кратности стартовую позицию.
				i += newLines - i % newLines;
			}

			var mem:ByteArray = new ByteArray();
			mem.writeBytes( _ENCODE_TABLE );
			mem.position = i + 1;
			mem.writeBytes( bytes );
			var rest:uint = bytes.length % 3;
			var bytesLength:uint = mem.length - rest - 1;

			// помещаем в пямять
			if ( mem.length < ApplicationDomain.MIN_DOMAIN_MEMORY_LENGTH ) mem.length = ApplicationDomain.MIN_DOMAIN_MEMORY_LENGTH;
			_DOMAIN.domainMemory = mem;

			var j:int = 63;	// сюда запишем результат
			var c:int = 0;

			do {

				c =	li8( ++i ) << 16 |
					li8( ++i ) << 8  |
					li8( ++i )       ;

				// TODO: speed test: setI8 x4 vs setI32
				si8( li8(   c >>> 18          ), ++j );
				si8( li8( ( c >>> 12 ) & 0x3F ), ++j );
				si8( li8( ( c >>> 6  ) & 0x3F ), ++j );
				si8( li8(   c          & 0x3F ), ++j );

				if ( insertNewLines && i % newLines == 0 ) {
					si16( 0x0A0D, ++j );
					++j;
				}

			} while ( i < bytesLength );

			if ( rest ) {
				if ( rest == 1 ) {
					c = li8( ++i );
					si8( li8(   c >>> 2       ), ++j );
					si8( li8( ( c & 3 ) <<  4 ), ++j );
					si8( 61, ++j );
					si8( 61, ++j );
				} else {
					c =	( li8( ++i ) << 8 )	|
						  li8( ++i )		;
					si8( li8(   c >>> 10          ), ++j );
					si8( li8( ( c >>>  4 ) & 0x3F ), ++j );
					si8( li8( ( c & 15 ) << 2     ), ++j );
					si8( 61, ++j );
				}
			}

			_DOMAIN.domainMemory = tmp;

			mem.position = 64;
			return mem.readUTFBytes( len );

		}

		/**
		 * Decodes the <code>String</code> previously encoded using Base64 algorithm.
		 *
		 * @param	str				The string containing encoded data.
		 *
		 * @return					The <code>ByteArray</code> obtained by decoding the <code>str</code>.
		 *
		 * @throws	VerifyError		If <code>str</code> is not valid Base64 string.
		 */
		public static function decode(str:String):ByteArray {

			if ( !str )	return new ByteArray();

			var tmp:ByteArray = _DOMAIN.domainMemory;

			var mem:ByteArray = new ByteArray();
			mem.writeBytes( _DECODE_TABLE );
			mem.writeUTFBytes( str );
			var bytesLength:uint = mem.length;
			mem.writeUTFBytes( '=' ); // записываю pad на всякий случай

			// помещаем в пямять
			if ( mem.length < ApplicationDomain.MIN_DOMAIN_MEMORY_LENGTH ) mem.length = ApplicationDomain.MIN_DOMAIN_MEMORY_LENGTH;
			_DOMAIN.domainMemory = mem;

			var i:int = 255;
			var j:int = 255;

			var a:int = 0;
			var b:int = 0;
			var c:int = 0;
			var d:int = 0;

			do {

				a = li8( li8( ++i ) );
				if ( a >= 0x40 ) {
					while ( a == 0x43 ) { // пропускаем пробелы
						a = li8( li8( ++i ) );
					}
					if ( a == 0x41 ) { // наткнулись на pad
						b = c = d = 0x41;
						break;
					} else if ( a == 0x40 ) { // не валидный символ
						_DOMAIN.domainMemory = tmp;
						Error.throwError( VerifyError, 1509 );
					}
				}

				b = li8( li8( ++i ) );
				if ( b >= 0x40 ) {
					while ( b == 0x43 ) { // пропускаем пробелы
						b = li8( li8( ++i ) );
					}
					if ( b == 0x41 ) { // наткнулись на pad
						c = d = 0x41;
						break;
					} else if ( b == 0x40 ) { // не валидный символ
						_DOMAIN.domainMemory = tmp;
						Error.throwError( VerifyError, 1509 );
					}
				}

				c = li8( li8( ++i ) );
				if ( c >= 0x40 ) {
					while ( c == 0x43 ) { // пропускаем пробелы
						c = li8( li8( ++i ) );
					}
					if ( c == 0x41 ) { // наткнулись на pad
						d = 0x41;
						break;
					} else if ( c == 0x40 ) { // не валидный символ
						_DOMAIN.domainMemory = tmp;
						Error.throwError( VerifyError, 1509 );
					}
				}

				d = li8( li8( ++i ) );
				if ( d >= 0x40 ) {
					while ( d == 0x43 ) { // пропускаем пробелы
						d = li8( li8( ++i ) );
					}
					if ( d == 0x41 ) { // наткнулись на pad
						break;
					} else if ( d == 0x40 ) { // не валидный символ
						_DOMAIN.domainMemory = tmp;
						Error.throwError( VerifyError, 1509 );
					}
				}

				si8( ( a << 2 ) | ( b >> 4 ), ++j );
				si8( ( b << 4 ) | ( c >> 2 ), ++j );
				si8( ( c << 6 ) |   d       , ++j );

			} while ( true );

			while ( i < bytesLength ) {
				// что-то помимо
				if ( !( li8( li8( ++i ) & 0x41 ) ) ) {
					_DOMAIN.domainMemory = tmp;
					Error.throwError( VerifyError, 1509 );
				}
			}

			if ( a != 0x41 && b != 0x41 ) {
				si8( ( a << 2 ) | ( b >> 4 ), ++j );
				if ( c != 0x41 ) {
					si8( ( b << 4 ) | ( c >> 2 ), ++j );
					if ( d != 0x41 ) {
						si8( ( c << 6 ) | d, ++j );
					}
				}
			}

			_DOMAIN.domainMemory = tmp;

			var result:ByteArray = new ByteArray();

			if ( j > 255 ) {
				mem.position = 256;
				mem.readBytes( result, 0, j - 255 );
			}

			return result;
		}

	}

}