import type { PathId } from "@/application/contracts"
import delugeIcon from "@/assets/path-icons/deluge.png?w=112&h=112&format=webp"
import draughtIcon from "@/assets/path-icons/draught.png?w=112&h=112&format=webp"
import dustIcon from "@/assets/path-icons/dust.png?w=112&h=112&format=webp"
import jadeIcon from "@/assets/path-icons/jade.png?w=112&h=112&format=webp"
import kiteIcon from "@/assets/path-icons/kite.png?w=112&h=112&format=webp"
import mightIcon from "@/assets/path-icons/might.png?w=112&h=112&format=webp"
import splendorIcon from "@/assets/path-icons/splendor.png?w=112&h=112&format=webp"
import strengthIcon from "@/assets/path-icons/strength.png?w=112&h=112&format=webp"
import umbraIcon from "@/assets/path-icons/umbra.png?w=112&h=112&format=webp"
import windIcon from "@/assets/path-icons/wind.png?w=112&h=112&format=webp"
import wingsIcon from "@/assets/path-icons/wings.png?w=112&h=112&format=webp"

// 연운 딜 계산기: 조율표 이미지에 넣는 유파 아이콘. 화면용(56px)보다 큰 112px을 써요.
export const largePathIcons: Record<PathId, string | null> = {
  mixed: null,
  bellstrikeSplendor: splendorIcon,
  bellstrikeUmbra: umbraIcon,
  stonesplitMight: mightIcon,
  stonesplitStrength: strengthIcon,
  silkbindJade: jadeIcon,
  silkbindDeluge: delugeIcon,
  silkbindWings: wingsIcon,
  bamboocutWind: windIcon,
  bamboocutKite: kiteIcon,
  bamboocutDust: dustIcon,
  bamboocutDraught: draughtIcon,
}
